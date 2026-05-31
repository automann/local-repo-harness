import {
  classifyPromptGuardIntent,
  decidePromptGuardAction,
  PROMPT_GUARD_ACTIONS,
  PROMPT_GUARD_PLAN_STATES,
  type PromptGuardAction,
  type PromptGuardIntentFacts,
  type PromptGuardPlanState,
  type PromptGuardState,
} from '../hook/prompt-guard-decision';

function envBool(name: string): boolean {
  return process.env[name] === '1' || process.env[name] === 'true';
}

function envEnum<T extends readonly string[]>(
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = process.env[name];
  if (value && allowed.includes(value)) return value;
  return fallback;
}

function readFactsFromEnv(): PromptGuardIntentFacts {
  return {
    done: envBool('PROMPT_GUARD_DONE_INTENT'),
    planStart: envBool('PROMPT_GUARD_PLAN_START_INTENT'),
    implement: envBool('PROMPT_GUARD_IMPLEMENT_INTENT'),
    planningDiscussion: envBool('PROMPT_GUARD_PLANNING_DISCUSSION_INTENT'),
    reviewRelease: envBool('PROMPT_GUARD_REVIEW_RELEASE_INTENT'),
    passiveWorktreeStatus: envBool('PROMPT_GUARD_PASSIVE_WORKTREE_STATUS_INTENT'),
    passiveCompletionReport: envBool('PROMPT_GUARD_PASSIVE_COMPLETION_REPORT_INTENT'),
    passiveNextSliceReport: envBool('PROMPT_GUARD_PASSIVE_NEXT_SLICE_REPORT_INTENT'),
    embeddedApprovedPlan: envBool('PROMPT_GUARD_EMBEDDED_APPROVED_PLAN_INTENT'),
    planShapedMarkdown: envBool('PROMPT_GUARD_PLAN_SHAPED_MARKDOWN_INTENT'),
    bugOrHunt: envBool('PROMPT_GUARD_BUG_OR_HUNT_INTENT'),
    planExecutionProjection: envBool('PROMPT_GUARD_PLAN_EXECUTION_PROJECTION_INTENT'),
  };
}

function readStateFromEnv(): PromptGuardState {
  return {
    spec: envEnum('PROMPT_GUARD_SPEC_STATE', ['present', 'missing'] as const, 'missing'),
    plan: envEnum(
      'PROMPT_GUARD_PLAN_STATE',
      PROMPT_GUARD_PLAN_STATES,
      'none',
    ) as PromptGuardPlanState,
    pending: envEnum(
      'PROMPT_GUARD_PENDING_STATE',
      ['none', 'fresh', 'stale'] as const,
      'none',
    ),
    worktree: envEnum(
      'PROMPT_GUARD_WORKTREE_STATE',
      ['current', 'linked_target', 'foreign_marker'] as const,
      'current',
    ),
    contract: envEnum(
      'PROMPT_GUARD_CONTRACT_STATE',
      ['present', 'missing'] as const,
      'missing',
    ),
    contractPath: envEnum(
      'PROMPT_GUARD_CONTRACT_PATH_STATE',
      ['present', 'missing'] as const,
      'missing',
    ),
    evidence: envEnum(
      'PROMPT_GUARD_EVIDENCE_STATE',
      ['unchecked', 'complete', 'incomplete'] as const,
      'unchecked',
    ),
  };
}

export function runPromptGuardDecisionFromEnv(): PromptGuardAction {
  const intent = classifyPromptGuardIntent(readFactsFromEnv());
  return decidePromptGuardAction(intent, readStateFromEnv());
}

export function assertKnownPromptGuardAction(action: string): asserts action is PromptGuardAction {
  if (!PROMPT_GUARD_ACTIONS.includes(action as PromptGuardAction)) {
    throw new Error(`unknown prompt guard action: ${action}`);
  }
}
