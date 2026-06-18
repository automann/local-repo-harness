import { Command } from 'commander';
import { runHelper } from '../runtime/helper-runner';

function exitWithHelper(helper: string, args: string[]): never {
  const result = runHelper({ helper, args });
  if (result.stderr && result.reason !== 'ok') {
    console.error(result.stderr);
  }
  process.exit(result.exitCode);
}

export function buildSprintCommand(): Command {
  const sprint = new Command('sprint')
    .description('Resolve and execute approved Sprint backlog rows through the repo-harness workflow');

  sprint
    .command('next')
    .description('Show the next pending Sprint backlog row')
    .option('--sprint <file>', 'Sprint file under plans/sprints/')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { sprint?: string; json?: boolean }) => {
      const args = ['next'];
      if (rawOpts.sprint) args.push('--sprint', rawOpts.sprint);
      if (rawOpts.json === true) args.push('--json');
      exitWithHelper('sprint-backlog', args);
    });

  sprint
    .command('execute-approved')
    .description('Capture an approved detailed plan for one Sprint row and project it into contract/worktree execution')
    .option('--body-file <file>', 'Approved detailed plan body to capture')
    .option('--task <index|task>', 'Backlog row index or task id (defaults to the next pending row)')
    .option('--slug <slug>', 'Plan slug (defaults to the backlog task id)')
    .option('--title <title>', 'Plan title (defaults to the backlog task id)')
    .option('--sprint <file>', 'Sprint file under plans/sprints/')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--no-worktree', 'Project the plan without starting a contract worktree')
    .option('--force', 'Reuse a backlog row even if it is marked in flight')
    .action((rawOpts: {
      bodyFile?: string;
      task?: string;
      slug?: string;
      title?: string;
      sprint?: string;
      json?: boolean;
      worktree?: boolean;
      force?: boolean;
    }) => {
      const args = ['execute-approved'];
      if (rawOpts.bodyFile) args.push('--body-file', rawOpts.bodyFile);
      if (rawOpts.task) args.push('--task', rawOpts.task);
      if (rawOpts.slug) args.push('--slug', rawOpts.slug);
      if (rawOpts.title) args.push('--title', rawOpts.title);
      if (rawOpts.sprint) args.push('--sprint', rawOpts.sprint);
      if (rawOpts.json === true) args.push('--json');
      if (rawOpts.worktree === false) args.push('--no-worktree');
      if (rawOpts.force === true) args.push('--force');
      exitWithHelper('sprint-backlog', args);
    });

  return sprint;
}
