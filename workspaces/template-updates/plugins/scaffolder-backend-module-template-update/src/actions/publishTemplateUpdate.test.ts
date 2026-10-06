import { publishTemplateUpdate } from './publishTemplateUpdate';
import type { MergeReport } from '../merge/mergeTrees';
import type {
  GitlabProject,
  MergeRequestDetails,
} from '../gitlab/GitlabClient';

const report: MergeReport = {
  added: ['new.txt'],
  deleted: ['removed.txt'],
  mergedClean: ['README.md'],
  mergedWithConflict: ['config.yaml'],
  projectDeleted: ['local.txt'],
  projectOnly: ['notes.md'],
  changed: true,
};

const options = {
  projectUrl: 'https://gitlab.example.com/group/payments/-/tree/main',
  resultFiles: {
    'new.txt': Buffer.from('new\n'),
    'README.md': Buffer.from('updated\n'),
    'keep.txt': Buffer.from('keep\n'),
  },
  report,
  templateName: 'service',
  targetVersion: '2.0.0',
  catalogOwner: 'group:default/platform',
};

const project: GitlabProject = {
  id: 11,
  projectSlug: 'group/payments',
  host: 'gitlab.example.com',
  repoUrl: 'https://gitlab.example.com/group/payments',
  defaultBranch: 'main',
};

const makeGitlab = (files: Record<string, Buffer>) => ({
  getProject: jest.fn(async () => project),
  readRepositoryFiles: jest.fn(async () => files),
  deleteBranch: jest.fn(async () => undefined),
  createBranch: jest.fn(async () => undefined),
  createCommit: jest.fn(async () => ({ sha: 'commit-sha' })),
  findOpenMergeRequest: jest.fn(
    async (): Promise<{ iid: number; webUrl: string } | undefined> => undefined,
  ),
  updateMergeRequest: jest.fn(
    async (
      _project: GitlabProject,
      _iid: number,
      _details: MergeRequestDetails,
    ) => undefined,
  ),
  createMergeRequest: jest.fn(async () => ({
    iid: 9,
    webUrl: 'https://gitlab.example.com/group/payments/-/merge_requests/9',
  })),
});

describe('publishTemplateUpdate', () => {
  it('opens no branch, commit, or MR when the result equals the default branch', async () => {
    const files = { 'same.txt': Buffer.from('same\n') };
    const gitlab = makeGitlab(files);

    const result = await publishTemplateUpdate(
      { ...options, resultFiles: files },
      { gitlab },
    );

    expect(result).toEqual({ status: 'none' });
    expect(gitlab.deleteBranch).not.toHaveBeenCalled();
    expect(gitlab.createBranch).not.toHaveBeenCalled();
    expect(gitlab.createCommit).not.toHaveBeenCalled();
    expect(gitlab.createMergeRequest).not.toHaveBeenCalled();
  });

  it('recreates an existing branch, commits changes, and updates the open MR', async () => {
    const gitlab = makeGitlab({
      'README.md': Buffer.from('old\n'),
      'removed.txt': Buffer.from('old\n'),
      'keep.txt': Buffer.from('keep\n'),
    });
    gitlab.findOpenMergeRequest.mockResolvedValue({
      iid: 7,
      webUrl: 'https://gitlab.example.com/group/payments/-/merge_requests/7',
    });

    const result = await publishTemplateUpdate(options, { gitlab });

    expect(result).toEqual({
      status: 'updated',
      mergeRequestUrl:
        'https://gitlab.example.com/group/payments/-/merge_requests/7',
    });
    expect(gitlab.deleteBranch).toHaveBeenCalledWith(
      project,
      'chore/template-update-service',
    );
    expect(gitlab.createBranch).toHaveBeenCalledWith(
      project,
      'chore/template-update-service',
      'main',
    );
    expect(gitlab.createCommit).toHaveBeenCalledWith(
      project,
      'chore/template-update-service',
      'chore(template): update to 2.0.0',
      expect.arrayContaining([
        expect.objectContaining({ action: 'create', file_path: 'new.txt' }),
        expect.objectContaining({ action: 'update', file_path: 'README.md' }),
        expect.objectContaining({ action: 'delete', file_path: 'removed.txt' }),
      ]),
    );
    expect(gitlab.updateMergeRequest).toHaveBeenCalledWith(
      project,
      7,
      expect.objectContaining({
        title: 'chore(template): update to 2.0.0',
        description: expect.stringContaining(
          'Catalog owner: group:default/platform',
        ),
      }),
    );
    const description = gitlab.updateMergeRequest.mock.calls[0][2].description;
    for (const section of [
      '## Added',
      '## Deleted',
      '## Merged cleanly',
      '## Merged with conflicts',
      '## Project-deleted (kept absent)',
      '## Project-only (untouched)',
      'AI conflict resolution is out of scope for U1',
    ]) {
      expect(description).toContain(section);
    }
    expect(gitlab.createMergeRequest).not.toHaveBeenCalled();
  });
});
