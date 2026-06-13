import * as readline from 'readline';

// 社区链接和 URL 从 ../utils/helpers 重新导出
export { printCommunityLinks, COMMUNITY_SKILLS_FEED_URL, COMMUNITY_CURATED_SKILLS_URL } from '../utils/helpers';

export function promptYesNo(question: string, defaultValue = true): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.resolve(false);
  }

  const suffix = defaultValue ? '[Y/n]' : '[y/N]';
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${question} ${suffix} `, answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (!normalized) {
        resolve(defaultValue);
        return;
      }
      resolve(['y', 'yes'].includes(normalized));
    });
  });
}
