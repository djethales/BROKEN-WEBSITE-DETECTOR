import type { IncidentType, SiteState, Verdict } from '../common/types';

export interface TransitionSite {
  currentState: SiteState;
  consecutiveFailures: number;
  hasOpenIncident: boolean;
}

export interface TransitionInput {
  verdict: Verdict;
  incidentType: IncidentType | null;
  failureThreshold: number;
  recheckDelayMinutes: number;
  checkIntervalMinutes: number;
  now: Date;
}

export interface TransitionResult {
  currentState: SiteState;
  consecutiveFailures: number;
  nextCheckAt: Date;
  stateChanged: boolean;
  openIncident: boolean;
  resolveIncident: boolean;
  updateOpenIncident: boolean;
  incidentType: IncidentType | null;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function transition(site: TransitionSite, input: TransitionInput): TransitionResult {
  const regular = addMinutes(input.now, input.checkIntervalMinutes);
  const recheck = addMinutes(input.now, input.recheckDelayMinutes);
  const base = {
    nextCheckAt: regular,
    incidentType: input.incidentType,
    openIncident: false,
    resolveIncident: false,
    updateOpenIncident: false,
  };

  if (input.verdict === 'HEALTHY') {
    return {
      ...base,
      currentState: 'HEALTHY',
      consecutiveFailures: 0,
      stateChanged: site.currentState !== 'HEALTHY',
      resolveIncident: site.hasOpenIncident,
    };
  }

  if (input.verdict === 'BLOCKED') {
    return {
      ...base,
      currentState: 'BLOCKED',
      consecutiveFailures: 0,
      stateChanged: site.currentState !== 'BLOCKED',
      incidentType: null,
    };
  }

  if (input.verdict === 'DOUBTFUL') {
    return {
      ...base,
      currentState: 'DOUBTFUL',
      consecutiveFailures: 0,
      stateChanged: site.currentState !== 'DOUBTFUL',
      incidentType: null,
    };
  }

  const failures = site.consecutiveFailures + 1;
  if (failures < input.failureThreshold) {
    return {
      ...base,
      currentState: site.currentState,
      consecutiveFailures: failures,
      nextCheckAt: recheck,
      stateChanged: false,
      incidentType: null,
    };
  }

  return {
    ...base,
    currentState: 'BROKEN',
    consecutiveFailures: failures,
    stateChanged: site.currentState !== 'BROKEN',
    openIncident: !site.hasOpenIncident,
    updateOpenIncident: site.hasOpenIncident,
  };
}
