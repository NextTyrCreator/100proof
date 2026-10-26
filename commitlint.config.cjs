module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci', 'infra', 'security', 'legal']],
    'scope-enum': [2, 'always', ['capture', 'valuation', 'evidence', 'packet', 'agents', 'insurance', 'schema', 'meta-client', 'web', 'worker', 'infra', 'docs', 'legal', 'repo']],
    'scope-empty': [2, 'never'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'trailer-exists': [2, 'always', 'Approved-by:'],
  },
};
