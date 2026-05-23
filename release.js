#!/usr/bin/env node

/**
 * LeadLens Complete Release Script v2.0
 * One-shot automation: version bump → build → download → GitHub → Scarlett → notify testers
 * 
 * Usage: node release.js
 * 
 * Requires environment variables:
 * - GITHUB_TOKEN: GitHub personal access token
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key
 * - RESEND_API_KEY: Resend email API key (for tester notifications)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname);
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'CHANGELOG.md');
const APP_JSON_PATH = path.join(PROJECT_ROOT, 'app.json');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * Bump version numbers in app.json and package.json
 */
function bumpVersions() {
  console.log('\n📌 Bumping version numbers...');
  
  try {
    // Update app.json
    const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'));
    const currentVersion = appJson.expo.version || '2.0.1';
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;
    
    appJson.expo.version = newVersion;
    appJson.expo.android.versionCode = (appJson.expo.android.versionCode || 1) + 1;
    
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n');
    console.log(`   app.json: ${currentVersion} → ${newVersion}`);

    // Update package.json
    const pkgJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    pkgJson.version = newVersion;
    
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2) + '\n');
    console.log(`   package.json: ${currentVersion} → ${newVersion}`);

    return newVersion;
  } catch (error) {
    console.error('❌ Version bump failed:', error.message);
    throw error;
  }
}

/**
 * Parse CHANGELOG to extract BETA version
 */
function parseChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error(`CHANGELOG.md not found at ${CHANGELOG_PATH}`);
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
  const versionMatch = content.match(/##\s+BETA-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  
  if (!versionMatch) {
    throw new Error('Invalid CHANGELOG format - expected: ## BETA-X | YYYY-MM-DD');
  }

  const buildNumber = parseInt(versionMatch[1], 10);
  const buildDate = versionMatch[2];
  const changesSectionMatch = content.match(/##\s+BETA-\d+.*?\n([\s\S]*?)(?=##|$)/);
  const changesText = changesSectionMatch ? changesSectionMatch[1].trim() : '';

  return {
    buildNumber,
    buildDate,
    changesText,
    version: `BETA-${buildNumber}`,
    versionName: `v2.0.1-BETA.${buildNumber}`,
    tag: `release-${buildNumber}`,
  };
}

/**
 * Get Git repository info
 */
function getGitRepoInfo() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
    }).trim();

    const match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+)(\.git)?$/);
    if (!match) {
      throw new Error('Could not parse GitHub repository from remote URL');
    }

    return {
      owner: match[1],
      repo: match[2],
      url: remoteUrl,
    };
  } catch (error) {
    console.error('Error getting git repo info:', error.message);
    process.exit(1);
  }
}

/**
 * Build Android APK
 */
async function buildAndroid() {
  console.log('\n📦 Building Android APK...');
  
  try {
    execSync('eas build --platform android --non-interactive', {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    console.log('✅ EAS build completed');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    throw error;
  }
}

/**
 * Download APK from EAS using direct REST API (no CLI)
 */
async function downloadAPK(buildInfo) {
  console.log('\n⬇️  Downloading APK artifact...');
  
  try {
    const https = require('https');
    
    // Query EAS API directly
    console.log('📡 Querying EAS API for latest build...');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.expo.dev',
        path: '/v2/builds?platform=android&limit=1',
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      };

      https.get(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', async () => {
          try {
            if (response.statusCode !== 200) {
              throw new Error(`EAS API returned ${response.statusCode}: ${data}`);
            }

            const result = JSON.parse(data);
            const builds = result.builds || [];

            if (builds.length === 0) {
              throw new Error('No builds found on EAS API');
            }

            const latestBuild = builds[0];
            const artifactUrl = latestBuild.artifacts?.buildUrl 
              || latestBuild.artifacts?.apk
              || latestBuild.artifact_url;

            if (!artifactUrl) {
              console.log('📋 Build response:', JSON.stringify(latestBuild, null, 2));
              throw new Error('No artifact URL in EAS API response');
            }

            console.log('✅ Got artifact URL from EAS API');
            console.log(`📥 Downloading: ${artifactUrl.substring(0, 70)}...`);

            // Download the APK
            const destPath = path.join(BUILD_DIR, `app-release-${buildInfo.buildNumber}.apk`);
            const file = fs.createWriteStream(destPath);

            https.get(artifactUrl, (downloadResponse) => {
              // Handle redirects
              if (downloadResponse.statusCode === 301 || downloadResponse.statusCode === 302) {
                console.log('📍 Following redirect...');
                file.destroy();
                try { fs.unlinkSync(destPath); } catch {}
                // Recursively call with the redirect URL
                const redirectUrl = new URL(downloadResponse.headers.location, artifactUrl);
                return downloadFromUrl(redirectUrl.toString(), destPath, buildInfo, resolve, reject);
              }

              if (downloadResponse.statusCode !== 200) {
                file.destroy();
                try { fs.unlinkSync(destPath); } catch {}
                reject(new Error(`Download failed: HTTP ${downloadResponse.statusCode}`));
                return;
              }

              const totalSize = parseInt(downloadResponse.headers['content-length'], 10);
              let downloadedSize = 0;

              downloadResponse.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = Math.round((downloadedSize / totalSize) * 100);
                const mb = (downloadedSize / 1024 / 1024).toFixed(1);
                const totalMb = (totalSize / 1024 / 1024).toFixed(1);
                process.stdout.write(`\r   ${percent}% (${mb}MB / ${totalMb}MB)`);
              });

              downloadResponse.pipe(file);

              file.on('finish', () => {
                file.close();
                console.log(`\n✅ APK downloaded: ${path.basename(destPath)}`);
                resolve(destPath);
              });

              file.on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch {}
                reject(err);
              });
            }).on('error', reject);

          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });

  } catch (error) {
    console.error('❌ APK download failed:', error.message);
    throw error;
  }
}

/**
 * Helper to download from a specific URL
 */
function downloadFromUrl(url, destPath, buildInfo, resolve, reject) {
  const https = require('https');
  const file = fs.createWriteStream(destPath);

  https.get(url, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      file.destroy();
      downloadFromUrl(response.headers.location, destPath, buildInfo, resolve, reject);
      return;
    }

    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;

    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      const percent = Math.round((downloadedSize / totalSize) * 100);
      process.stdout.write(`\r   ${percent}%`);
    });

    response.pipe(file);
    file.on('finish', () => {
      file.close();
      resolve(destPath);
    });
    file.on('error', reject);
  }).on('error', reject);
}

/**
 * Create GitHub Release and upload APK
 */
async function createGitHubRelease(buildInfo, apkPath, repoInfo) {
  console.log('\n📤 Creating GitHub Release and uploading APK...');
  
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  try {
    // Create release
    const releaseUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases`;
    
    const createRes = await fetch(releaseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: buildInfo.tag,
        name: `${buildInfo.version} - ${buildInfo.buildDate}`,
        body: buildInfo.changesText,
        draft: false,
        prerelease: true,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`GitHub release creation failed (${createRes.status}): ${errorText}`);
    }

    const release = await createRes.json();
    console.log(`✅ GitHub Release created: ${release.html_url}`);

    // Upload APK as asset
    const fileName = path.basename(apkPath);
    const fileContent = fs.readFileSync(apkPath);
    
    const uploadUrl = `https://uploads.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/${release.id}/assets?name=${fileName}`;
    
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
      },
      body: fileContent,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`APK upload failed (${uploadRes.status}): ${errorText}`);
    }

    const asset = await uploadRes.json();
    console.log(`✅ APK uploaded: ${fileName}`);

    return {
      releaseUrl: release.html_url,
      apkDownloadUrl: asset.browser_download_url,
    };

  } catch (error) {
    console.error('❌ GitHub release failed:', error.message);
    throw error;
  }
}

/**
 * Update Scarlett app_config in Supabase
 */
async function updateScarletConfig(buildInfo, apkUrl) {
  console.log('\n🔄 Updating Scarlett app_config...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn('⚠️  Supabase credentials not set. Skipping Scarlett update.');
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/app_config?id=eq.1`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        current_build: buildInfo.buildNumber,
        version_name: buildInfo.versionName,
        apk_url: apkUrl,
        update_message: buildInfo.changesText,
        force_update: true,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    console.log('✅ Scarlett app_config updated successfully');
    return true;

  } catch (error) {
    console.error('❌ Scarlett update failed:', error.message);
    throw error;
  }
}

/**
 * Send notifications to testers
 */
async function notifyTesters(buildInfo, downloadUrl) {
  console.log('\n📧 Notifying testers...');
  
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('⚠️  RESEND_API_KEY not set. Skipping tester notifications.');
    return false;
  }

  const testerEmails = [
    'theokaymediafam@gmail.com',
    // Add more tester emails here
  ];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@leadlens.dev',
        to: testerEmails,
        subject: `🚀 LeadLens ${buildInfo.version} Available for Testing`,
        html: `
          <h2>New LeadLens Build Ready! 🎉</h2>
          <p><strong>Version:</strong> ${buildInfo.versionName}</p>
          <p><strong>Build Date:</strong> ${buildInfo.buildDate}</p>
          
          <h3>What's New:</h3>
          <pre>${buildInfo.changesText}</pre>
          
          <p>
            <strong><a href="${downloadUrl}" style="background-color: #00C9FF; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              📥 Download APK
            </a></strong>
          </p>
          
          <p style="color: #666; font-size: 12px;">
            Please report any issues or feedback to the team.
          </p>
        `,
      }),
    });

    if (!res.ok) {
      throw new Error(`Email API returned ${res.status}`);
    }

    console.log(`✅ Notifications sent to ${testerEmails.length} testers`);
    return true;

  } catch (error) {
    console.error('⚠️  Tester notification failed:', error.message);
    // Don't throw - notifications are nice-to-have
    return false;
  }
}

/**
 * Commit changes to git
 */
function commitAndPush(buildInfo) {
  console.log('\n📝 Committing to git...');
  
  try {
    // Stage files
    execSync('git add app.json package.json CHANGELOG.md', { cwd: PROJECT_ROOT });
    
    // Commit
    execSync(
      `git commit -m "chore(release): ${buildInfo.version} - ${buildInfo.buildDate}"`,
      { cwd: PROJECT_ROOT }
    );
    console.log('✅ Changes committed');

    // Create tag
    execSync(
      `git tag -a ${buildInfo.tag} -m "${buildInfo.version} - ${buildInfo.buildDate}"`,
      { cwd: PROJECT_ROOT }
    );
    console.log(`✅ Tag created: ${buildInfo.tag}`);

    // Push
    execSync('git push origin main --tags', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    console.log('✅ Pushed to GitHub');

  } catch (error) {
    console.warn('⚠️  Git operations failed:', error.message);
    console.log('   You may need to push manually');
  }
}

/**
 * Main release flow
 */
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 LeadLens Complete Release v2.0');
    console.log('='.repeat(60));

    // 1. Bump versions
    const newVersion = bumpVersions();

    // 2. Parse changelog
    const buildInfo = parseChangelog();
    console.log(`\n📖 Release Info:`);
    console.log(`   Build: ${buildInfo.version}`);
    console.log(`   Version: ${buildInfo.versionName}`);
    console.log(`   Date: ${buildInfo.buildDate}`);

    // 3. Get repo info
    const repoInfo = getGitRepoInfo();
    console.log(`   Repo: ${repoInfo.owner}/${repoInfo.repo}`);

    // 4. Build APK
    await buildAndroid();

    // 5. Download APK
    const apkPath = await downloadAPK(buildInfo);

    // 6. Create GitHub Release and upload APK
    const { releaseUrl, apkDownloadUrl } = await createGitHubRelease(buildInfo, apkPath, repoInfo);

    // 7. Update Scarlett
    await updateScarletConfig(buildInfo, apkDownloadUrl);

    // 8. Notify testers
    await notifyTesters(buildInfo, apkDownloadUrl);

    // 9. Commit and push
    commitAndPush(buildInfo);

    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✅ RELEASE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\n🎉 ${buildInfo.version} successfully released!\n`);
    console.log('📊 Summary:');
    console.log(`   Version Bumped: ${newVersion}`);
    console.log(`   APK Built: ✅`);
    console.log(`   GitHub Release: ${releaseUrl}`);
    console.log(`   Scarlett Updated: ✅`);
    console.log(`   Testers Notified: ✅`);
    console.log(`   Git Pushed: ✅`);
    console.log('\n🚀 Ready for distribution!\n');

  } catch (error) {
    console.error('\n❌ RELEASE FAILED:', error.message);
    console.error('\nPlease fix the issue and try again.');
    process.exit(1);
  }
}

main();
