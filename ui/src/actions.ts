import { api, type JobUpdateResult } from './api';
import type { ToastTone } from './composables/useToasts';
import type { Tone } from './jobs';

export type JobAction = 'run' | 'requeue' | 'disable' | 'enable' | 'delete';

interface ActionMeta {
  label: string;
  icon: string;
  tone: Tone;
  /** Asks before acting: the action has side effects or cannot be undone. */
  confirm: boolean;
  /** Shown in the confirmation. */
  description: string;
}

export const ACTIONS: Record<JobAction, ActionMeta> = {
  run: {
    label: 'Run now',
    icon: 'play_arrow',
    tone: 'success',
    confirm: true,
    description:
      'The job runs at the next Agenda scan and keeps its schedule. Running and disabled jobs are skipped.',
  },
  requeue: {
    label: 'Requeue',
    icon: 'replay',
    tone: 'primary',
    confirm: true,
    description: 'Creates a copy of the job, with the same name and data, that runs immediately.',
  },
  disable: {
    label: 'Disable',
    icon: 'pause',
    tone: 'secondary',
    confirm: false,
    description: 'Agenda stops running the job until it is enabled again.',
  },
  enable: {
    label: 'Enable',
    icon: 'play_circle',
    tone: 'secondary',
    confirm: false,
    description: 'Agenda runs the job again on its schedule.',
  },
  delete: {
    label: 'Delete',
    icon: 'delete',
    tone: 'danger',
    confirm: true,
    description: 'The job is removed permanently. This cannot be undone.',
  },
};

export function jobCount(count: number): string {
  return `${count} job${count === 1 ? '' : 's'}`;
}

function updateSummary(result: JobUpdateResult, done: string, skippedReason: string) {
  const parts = [];
  if (result.updated > 0) parts.push(`${jobCount(result.updated)} ${done}`);
  if (result.skipped > 0) parts.push(`${jobCount(result.skipped)} skipped (${skippedReason})`);
  const tone: ToastTone = result.updated === 0 ? 'warning' : 'success';
  return { message: parts.join(', ') || 'Nothing to do', tone };
}

/** Calls the API for `action` and describes the outcome for a notification. */
export async function performAction(
  action: JobAction,
  jobIds: string[],
): Promise<{ message: string; tone: ToastTone }> {
  switch (action) {
    case 'run':
      return updateSummary(await api.runJobs(jobIds), 'will run now', 'running or disabled');
    case 'disable':
      return updateSummary(await api.disableJobs(jobIds), 'disabled', 'running');
    case 'enable':
      return updateSummary(await api.enableJobs(jobIds), 'enabled', 'running');
    case 'requeue':
      await api.requeueJobs(jobIds);
      return { message: `${jobCount(jobIds.length)} requeued`, tone: 'success' };
    case 'delete':
      await api.deleteJobs(jobIds);
      return { message: `${jobCount(jobIds.length)} deleted`, tone: 'success' };
  }
}
