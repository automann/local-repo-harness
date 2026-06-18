import { Command } from 'commander';
import { listHelperIds, runHelper } from '../runtime/helper-runner';

export function buildRunCommand(): Command {
  const run = new Command('run')
    .description('Run a bundled repo-harness workflow helper')
    .allowUnknownOption(true)
    .helpOption(false);

  run
    .argument('[helper]', 'Helper id, for example check-task-workflow')
    .argument('[args...]', 'Arguments passed to the helper')
    .action((helper: string | undefined, args: string[]) => {
      if (helper === undefined || helper === '--help' || helper === '-h' || helper === 'help') {
        if (helper === undefined && !args.includes('--help') && !args.includes('-h')) {
          console.error('local-repo-harness run: missing helper');
          run.outputHelp({ error: true });
          process.exit(2);
        }
        run.outputHelp();
        process.exit(0);
      }

      const result = runHelper({ helper, args });
      if (result.stderr && result.reason !== 'ok') {
        console.error(result.stderr);
        const helpers = listHelperIds();
        if (helpers.length > 0) console.error(`known helpers: ${helpers.join(', ')}`);
      }
      process.exit(result.exitCode);
    });

  return run;
}
