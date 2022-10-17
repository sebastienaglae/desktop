import * as React from 'react'
import memoize from 'memoize-one'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { List } from '../lib/list'
import { arrayEquals } from '../../lib/equality'
import { DragData } from '../../models/drag-drop'
import classNames from 'classnames'
import { CommitListItemActions } from './commit-list-item-actions'

const RowHeight = 50

interface ICommitListActionProps {
  /** The GitHub repository associated with this commit (if found) */
  readonly gitHubRepository: GitHubRepository | null

  /** The list of commits SHAs to display, in order. */
  readonly commitSHAs: ReadonlyArray<string>

  /** The commits loaded, keyed by their full SHA. */
  readonly commitLookup: Map<string, Commit>

  /** The SHAs of the selected commits */
  readonly selectedSHAs: ReadonlyArray<string>

  /** Whether or not commits in this list can be undone. */
  readonly canUndoCommits?: boolean

  /** Whether or not commits in this list can be amended. */
  readonly canAmendCommits?: boolean

  /** Whether or the user can reset to commits in this list. */
  readonly canResetToCommits?: boolean

  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, string>

  /** The list of known local commits for the current branch */
  readonly localCommitSHAs: ReadonlyArray<string>

  /** The message to display inside the list when no results are displayed */
  readonly emptyListMessage?: JSX.Element | string

  /** Callback which fires when a commit has been selected in the list */
  readonly onCommitsSelected?: (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll?: (start: number, end: number) => void

  /**
   * Optional callback that fires on page scroll in order to allow passing
   * a new scrollTop value up to the parent component for storing.
   */
  readonly onCompareListScrolled?: (scrollTop: number) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly compareListScrollTop?: number

  /* Whether the repository is local (it has no remotes) */
  readonly isLocalRepository: boolean

  /* Tags that haven't been pushed yet. This is used to show the unpushed indicator */
  readonly tagsToPush?: ReadonlyArray<string>

  /** Whether a cherry pick is progress */
  readonly isCherryPickInProgress?: boolean

  /** Shas that should be highlighted */
  readonly shasToHighlight?: ReadonlyArray<string>
}

/** A component which displays the list of commits. */
export class CommitListAction extends React.Component<
  ICommitListActionProps,
  {}
> {
  private commitsHash = memoize(makeCommitsHash, arrayEquals)

  private getVisibleCommits(): ReadonlyArray<Commit> {
    const commits = new Array<Commit>()
    for (const sha of this.props.commitSHAs) {
      const commitMaybe = this.props.commitLookup.get(sha)
      // this should never be undefined, but just in case
      if (commitMaybe !== undefined) {
        commits.push(commitMaybe)
      }
    }
    return commits
  }

  private renderCommit = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)

    if (commit == null) {
      if (__DEV__) {
        log.warn(
          `[CommitList]: the commit '${sha}' does not exist in the cache`
        )
      }
      return null
    }

    const tagsToPushSet = new Set(this.props.tagsToPush ?? [])

    const isLocal = this.props.localCommitSHAs.includes(commit.sha)
    const unpushedTags = commit.tags.filter(tagName =>
      tagsToPushSet.has(tagName)
    )

    const showUnpushedIndicator =
      (isLocal || unpushedTags.length > 0) &&
      this.props.isLocalRepository === false

    return (
      <CommitListItemActions
        key={commit.sha}
        gitHubRepository={this.props.gitHubRepository}
        isLocal={isLocal}
        showUnpushedIndicator={showUnpushedIndicator}
        unpushedIndicatorTitle={this.getUnpushedIndicatorTitle(
          isLocal,
          unpushedTags.length
        )}
        unpushedTags={unpushedTags}
        commit={commit}
        emoji={this.props.emoji}
        selectedCommits={this.lookupCommits(this.props.selectedSHAs)}
        isCherryPickInProgress={this.props.isCherryPickInProgress}
      />
    )
  }

  private getUnpushedIndicatorTitle(
    isLocalCommit: boolean,
    numUnpushedTags: number
  ) {
    if (isLocalCommit) {
      return 'This commit has not been pushed to the remote repository'
    }

    if (numUnpushedTags > 0) {
      return `This commit has ${numUnpushedTags} tag${
        numUnpushedTags > 1 ? 's' : ''
      } to push`
    }

    return undefined
  }

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    // Multi select can give something like 1, 5, 3 depending on order that user
    // selects. We want to ensure they are in chronological order for best
    // cherry-picking results. If user wants to use cherry-picking for
    // reordering, they will need to do multiple cherry-picks.
    // Goal: first commit in history -> first on array
    const sorted = [...rows].sort((a, b) => b - a)
    const selectedShas = sorted.map(r => this.props.commitSHAs[r])
    const selectedCommits = this.lookupCommits(selectedShas)
    this.props.onCommitsSelected?.(selectedCommits, this.isContiguous(sorted))
  }

  /**
   * Accepts a sorted array of numbers in descending order. If the numbers ar
   * contiguous order, 4, 3, 2 not 5, 3, 1, returns true.
   *
   * Defined an array of 0 and 1 are considered contiguous.
   */
  private isContiguous(indexes: ReadonlyArray<number>) {
    if (indexes.length <= 1) {
      return true
    }

    for (let i = 0; i < indexes.length; i++) {
      const current = indexes[i]
      if (i + 1 === indexes.length) {
        continue
      }

      if (current - 1 !== indexes[i + 1]) {
        return false
      }
    }

    return true
  }

  // This is required along with onSelectedRangeChanged in the case of a user
  // paging up/down or using arrow keys up/down.
  private onSelectedRowChanged = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    if (commit) {
      this.props.onCommitsSelected?.([commit], true)
    }
  }

  private lookupCommits(
    commitSHAs: ReadonlyArray<string>
  ): ReadonlyArray<Commit> {
    const commits: Commit[] = []
    commitSHAs.forEach(sha => {
      const commit = this.props.commitLookup.get(sha)
      if (commit === undefined) {
        log.warn(
          '[Commit List] - Unable to lookup commit from sha - This should not happen.'
        )
        return
      }
      commits.push(commit)
    })
    return commits
  }

  private onScroll = (scrollTop: number, clientHeight: number) => {
    const numberOfRows = Math.ceil(clientHeight / RowHeight)
    const top = Math.floor(scrollTop / RowHeight)
    const bottom = top + numberOfRows
    this.props.onScroll?.(top, bottom)

    // Pass new scroll value so the scroll position will be remembered (if the callback has been supplied).
    this.props.onCompareListScrolled?.(scrollTop)
  }

  private rowForSHA(sha_: string | null): number {
    const sha = sha_
    if (!sha) {
      return -1
    }

    return this.props.commitSHAs.findIndex(s => s === sha)
  }

  private getRowCustomClassMap = () => {
    const { commitSHAs, shasToHighlight } = this.props
    if (shasToHighlight === undefined || shasToHighlight.length === 0) {
      return undefined
    }

    const rowsForShasNotInDiff = commitSHAs
      .filter(sha => shasToHighlight.includes(sha))
      .map(sha => this.rowForSHA(sha))

    if (rowsForShasNotInDiff.length === 0) {
      return undefined
    }

    const rowClassMap = new Map<string, ReadonlyArray<number>>()
    rowClassMap.set('highlighted', rowsForShasNotInDiff)
    return rowClassMap
  }

  public render() {
    const { commitSHAs, selectedSHAs, shasToHighlight, emptyListMessage } =
      this.props
    if (commitSHAs.length === 0) {
      return (
        <div className="panel blankslate">
          {emptyListMessage ?? 'No commits to list'}
        </div>
      )
    }

    const classes = classNames({
      'has-highlighted-commits':
        shasToHighlight !== undefined && shasToHighlight.length > 0,
    })

    return (
      <div id="commit-list" className={classes}>
        <List
          rowCount={commitSHAs.length}
          rowHeight={RowHeight}
          selectedRows={selectedSHAs.map(sha => this.rowForSHA(sha))}
          rowRenderer={this.renderCommit}
          onDropDataInsertion={this.onDropDataInsertion}
          onSelectionChanged={this.onSelectionChanged}
          onSelectedRowChanged={this.onSelectedRowChanged}
          selectionMode="multi"
          onScroll={this.onScroll}
          invalidationProps={{
            commits: this.props.commitSHAs,
            localCommitSHAs: this.props.localCommitSHAs,
            commitLookupHash: this.commitsHash(this.getVisibleCommits()),
            tagsToPush: this.props.tagsToPush,
            shasToHighlight: this.props.shasToHighlight,
          }}
          setScrollTop={this.props.compareListScrollTop}
          rowCustomClassNameMap={this.getRowCustomClassMap()}
        />
      </div>
    )
  }

  private onDropDataInsertion = (row: number, data: DragData) => {
    // The base commit index will be in row - 1, because row is the position
    // where the new item should be inserted, and commits have a reverse order
    // (newer commits are in lower row values) in the list.
    const baseCommitIndex = row === 0 ? null : row - 1

    if (
      this.props.commitSHAs.length === 0 ||
      (baseCommitIndex !== null &&
        baseCommitIndex > this.props.commitSHAs.length)
    ) {
      return
    }

    const commitIndexes = data.commits
      .filter((v): v is Commit => v !== null && v !== undefined)
      .map(v => this.props.commitSHAs.findIndex(sha => sha === v.sha))
      .sort() // Required to check if they're contiguous

    // Check if values in commit indexes are contiguous
    const commitsAreContiguous = commitIndexes.every((value, i, array) => {
      return i === array.length - 1 || value === array[i + 1] - 1
    })

    // If commits are contiguous and they are dropped in a position contained
    // among those indexes, ignore the drop.
    if (commitsAreContiguous) {
      const firstDroppedCommitIndex = commitIndexes[0]

      // Commits are dropped right above themselves if
      // 1. The base commit index is null (meaning, it was dropped at the top
      //    of the commit list) and the index of the first dropped commit is 0.
      // 2. The base commit index is the index right above the first dropped.
      const commitsDroppedRightAboveThemselves =
        (baseCommitIndex === null && firstDroppedCommitIndex === 0) ||
        baseCommitIndex === firstDroppedCommitIndex - 1

      // Commits are dropped within themselves if there is a base commit index
      // and it's in the list of commit indexes.
      const commitsDroppedWithinThemselves =
        baseCommitIndex !== null &&
        commitIndexes.indexOf(baseCommitIndex) !== -1

      if (
        commitsDroppedRightAboveThemselves ||
        commitsDroppedWithinThemselves
      ) {
        return
      }
    }
  }
}

/**
 * Makes a hash of the commit's data that will be shown in a CommitListItem
 */
function commitListItemHash(commit: Commit): string {
  return `${commit.sha} ${commit.tags}`
}

function makeCommitsHash(commits: ReadonlyArray<Commit>): string {
  return commits.map(commitListItemHash).join(' ')
}
