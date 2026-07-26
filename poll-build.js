#!/usr/bin/env node
/**
 * poll-build.js
 *
 * Polls an EAS build's status until it finishes (or errors/cancels), so you
 * don't have to babysit the terminal or get bit by release.js's build timeout.
 *
 * Usage:
 *   node poll-build.js <build-id> [--interval=60] [--run-release]
 *
 * Examples:
 *   node poll-build.js f5507077-1ea0-411b-bedd-e206f7ce80cd
 *   node poll-build.js f5507077-1ea0-411b-bedd-e206f7ce80cd --interval=30 --run-release
 *
 * Requires: eas-cli logged in (same session release.js already used).
 *
 * NOTE: this assumes `eas build:view <id> --json` returns a JSON object with
 * a top-level `status` field (e.g. "FINISHED", "ERRORED", "CANCELED",
 * "IN_PROGRESS", "IN_QUEUE") and an `artifacts.buildUrl` field once finished.
 * If your eas-cli version's output shape differs, run
 * `eas build:view <id> --json` once by hand and adjust the field names below
 * — flagging this as the one swappable/unverified part of the script.
 */

const { execSync, spawn } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const buildId = args.find((a) => !a.startsWith('--'));
  const intervalArg = args.find((a) => a.startsWith('--interval='));
  const interval = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 60;
  const runRelease = args.includes('--run-release');
  return { buildId, interval, runRelease };
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBuildStatus(buildId) {
  const raw = execSync(`eas build:view ${buildId} --json`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

async function poll() {
  const { buildId, interval, runRelease } = parseArgs();

  if (!buildId) {
    console.error('Usage: node poll-build.js <build-id> [--interval=seconds] [--run-release]');
    process.exit(1);
  }

  console.log(`[${timestamp()}] Watching build ${buildId} (checking every ${interval}s)...`);

  // Track consecutive failures so a flaky network call doesn't kill the loop,
  // but repeated real failures still surface instead of polling forever.
  let consecutiveErrors = 0;

  while (true) {
    let build;
    try {
      build = getBuildStatus(buildId);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.error(`[${timestamp()}] Failed to query build status (${consecutiveErrors}):`, err.message);
      if (consecutiveErrors >= 5) {
        console.error(`[${timestamp()}] Giving up after 5 consecutive failures.`);
        process.exit(1);
      }
      await sleep(interval * 1000);
      continue;
    }

    const status = build.status;
    console.log(`[${timestamp()}] Status: ${status}`);

    if (status === 'FINISHED') {
      console.log(`[${timestamp()}] Build finished.`);
      const artifactUrl = build.artifacts && build.artifacts.buildUrl;
      if (artifactUrl) {
        console.log(`Artifact URL: ${artifactUrl}`);
      }

      if (runRelease) {
        console.log(`[${timestamp()}] Launching: node release.js`);
        const child = spawn('node', ['release.js'], { stdio: 'inherit', shell: true });
        child.on('exit', (code) => process.exit(code === null ? 1 : code));
        return; // let the child's exit drive process exit
      }

      console.log('Now run: node release.js   (or: node release.js --download-only)');
      process.exit(0);
    }

    if (status === 'ERRORED' || status === 'CANCELED') {
      console.error(`[${timestamp()}] Build ${status}.`);
      if (build.error) {
        console.error('Error details:', build.error.message || build.error);
      }
      process.exit(1);
    }

    // IN_QUEUE, IN_PROGRESS, or anything else -> keep waiting
    await sleep(interval * 1000);
  }
}

poll();
