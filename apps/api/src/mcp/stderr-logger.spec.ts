import { StderrLogger } from './stderr-logger.js';

describe('StderrLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes every level to stderr, never stdout', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = new StderrLogger('Test');

    logger.log('hello');
    logger.error('boom');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(2);
    expect(String(stderr.mock.calls[0][0])).toContain('hello');
  });
});
