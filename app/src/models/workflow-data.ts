export class WorkflowData {
  public name: string | undefined
  public path: string | undefined
  public state: WorkflowState | undefined
  public createAt: string | undefined
  public updateAt: string | undefined
  public url: string | undefined
  public htmlUrl: string | undefined
  public badgeUrl: string | undefined
}

export enum WorkflowState {
  None,
  Active = 'active',
  Deleted = 'deleted',
  DisabledFork = 'disabled_fork',
  DisabledInactivity = 'disabled_inactivity',
  DisabledManually = 'disabled_manually',
}
