/** Conventional Commits 校验（配合 simple-git-hooks 的 commit-msg 钩子） */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 财务项目，type 收敛到这几个就够
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'style', 'docs', 'test', 'build', 'chore', 'revert'],
    ],
    // 中文正文也要能通过，不限制大小写
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}
