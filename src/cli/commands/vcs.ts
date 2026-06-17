import { Command } from "commander";
import {
  auditLocalOnlyVcs,
  cleanupLocalOnlyVcs,
  formatVcsAudit,
  formatVcsCleanup,
  scopesAreValid,
  type VcsScope,
} from "../vcs/local-only";

interface VcsCliOptions {
  repo?: string;
  json?: boolean;
  vcsScope?: string;
}

interface VcsCleanupCliOptions extends VcsCliOptions {
  apply?: boolean;
  dryRun?: boolean;
}

function parseScope(value: string | undefined, command: string): VcsScope | undefined {
  if (value === undefined) return undefined;
  if (scopesAreValid(value)) return value;
  console.error(`local-repo-harness ${command}: invalid --vcs-scope "${value}" (expected: local, tracked)`);
  process.exit(2);
}

export function buildVcsCommand(): Command {
  const vcs = new Command("vcs").description("Audit and clean local-only Git boundaries for project-scoped installs");

  vcs
    .command("audit")
    .description("Read-only check for tracked or unignored local-only repo-harness artifacts")
    .option("--repo <path>", "Target repository path (defaults to cwd)")
    .option("--vcs-scope <scope>", "Override VCS scope for this audit: local|tracked")
    .option("--json", "Output JSON instead of human-readable text")
    .action((rawOpts: VcsCliOptions) => {
      const scope = parseScope(rawOpts.vcsScope, "vcs audit");
      const report = auditLocalOnlyVcs(rawOpts.repo ?? process.cwd(), { vcsScope: scope });
      console.log(formatVcsAudit(report, rawOpts.json === true));
      process.exit(report.safeToCommit ? 0 : 1);
    });

  vcs
    .command("cleanup")
    .description("Remove safe local-only artifacts from the Git index without deleting files")
    .option("--repo <path>", "Target repository path (defaults to cwd)")
    .option("--vcs-scope <scope>", "Override VCS scope for this cleanup: local|tracked")
    .option("--dry-run", "Print cleanup commands without mutating the Git index")
    .option("--apply", "Apply cleanup with git rm --cached; never deletes files")
    .option("--json", "Output JSON instead of human-readable text")
    .action((rawOpts: VcsCleanupCliOptions) => {
      const scope = parseScope(rawOpts.vcsScope, "vcs cleanup");
      if (rawOpts.apply === true && rawOpts.dryRun === true) {
        console.error("local-repo-harness vcs cleanup: use either --apply or --dry-run, not both");
        process.exit(2);
      }
      const plan = cleanupLocalOnlyVcs(rawOpts.repo ?? process.cwd(), {
        vcsScope: scope,
        apply: rawOpts.apply === true,
      });
      console.log(formatVcsCleanup(plan, rawOpts.json === true));
      process.exit(plan.safeToCommit ? 0 : 1);
    });

  return vcs;
}

