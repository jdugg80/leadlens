import { AI_PERSONALITY_STYLES } from '../constants';
import { getAIPersonalityStyle } from './aiWelcome';

const MESSAGES = {
  [AI_PERSONALITY_STYLES.PROFESSIONAL]: {
    prospectAdded: 'Prospect successfully added to the queue.',
    exportCreated: 'Export file has been generated.',
    exportSent: 'Export has been delivered successfully.',
    dailyGoalMet: 'Daily prospecting goal has been achieved.',
    noDataFallback: 'No data available for this request.',
    zipRecommendation: 'Area {zip} is recommended based on current data.',
  },
  [AI_PERSONALITY_STYLES.FRIENDLY_COACH]: {
    prospectAdded: 'Great job! You added a new prospect to your list.',
    exportCreated: 'Your export is ready! You’re doing awesome.',
    exportSent: 'Export sent! Keep up that great momentum.',
    dailyGoalMet: 'You did it! Daily goal crushed. So proud of your work today!',
    noDataFallback: 'I couldn’t find anything right now, but keep searching!',
    zipRecommendation: 'I think {zip} would be a fantastic place for you to work today!',
  },
  [AI_PERSONALITY_STYLES.MOTIVATOR]: {
    prospectAdded: 'Target acquired! Another one for the win!',
    exportCreated: 'Data locked and loaded. Time to execute!',
    exportSent: 'Boom! Export delivered. Let’s keep crushing it!',
    dailyGoalMet: 'GOAL REACHED! You are a prospecting machine! Don’t stop now!',
    noDataFallback: 'No data? No problem. Go out there and create some!',
    zipRecommendation: 'Drop everything and hit {zip}. It’s prime time!',
  },
  [AI_PERSONALITY_STYLES.SARCASTIC]: {
    prospectAdded: 'Another name for the spreadsheet. Riveting stuff.',
    exportCreated: 'Your file is ready. Try not to lose this one.',
    exportSent: 'It’s in the digital void now. Hope they actually read it.',
    dailyGoalMet: 'You met your goal. Gold star. Now do it again tomorrow.',
    noDataFallback: 'Nothing here. Maybe the map is tired of looking at you.',
    zipRecommendation: 'I reviewed your activity because apparently dots on a map need adult supervision. Start with {zip} today.',
  },
  [AI_PERSONALITY_STYLES.MINIMAL]: {
    prospectAdded: 'Added.',
    exportCreated: 'Created.',
    exportSent: 'Sent.',
    dailyGoalMet: 'Goal met.',
    noDataFallback: 'None.',
    zipRecommendation: 'Target: {zip}.',
  },
  [AI_PERSONALITY_STYLES.PREMIUM_EXECUTIVE]: {
    prospectAdded: 'Strategic acquisition completed. Prospect queued.',
    exportCreated: 'Executive summary generated and ready for review.',
    exportSent: 'Data transmission successful. Distribution complete.',
    dailyGoalMet: 'Exceptional performance. Daily objectives have been finalized.',
    noDataFallback: 'Our analysis yielded no significant results at this time.',
    zipRecommendation: 'Market analysis suggests {zip} as the optimal territory for today’s operations.',
  },
};

export async function getStyledMessage(key, context = {}) {
  const style = await getAIPersonalityStyle();
  let msg = MESSAGES[style]?.[key] || MESSAGES[AI_PERSONALITY_STYLES.PROFESSIONAL][key] || '';

  Object.entries(context).forEach(([k, v]) => {
    msg = msg.replace(`{${k}}`, v);
  });

  return msg;
}

export function getPreviewLine(style) {
  if (style === AI_PERSONALITY_STYLES.SARCASTIC) {
    return 'I reviewed your prospecting activity because apparently dots on a map need adult supervision. Start with 77566 today.';
  }
  const msg = MESSAGES[style]?.zipRecommendation || MESSAGES[AI_PERSONALITY_STYLES.PROFESSIONAL].zipRecommendation;
  return msg.replace('{zip}', '77566');
}
