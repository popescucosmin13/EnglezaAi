import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mode: vi.fn(async () => {}),
  active: vi.fn(async () => {}),
  speak: vi.fn(),
  stop: vi.fn(async () => {}),
}));
vi.mock('expo-speech', () => ({ speak: mocks.speak, stop: mocks.stop }));
vi.mock('expo-audio', () => ({
  setAudioModeAsync: mocks.mode, setIsAudioActiveAsync: mocks.active,
  createAudioPlayer: vi.fn(),
}));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('../settings', () => ({ getSettings: () => ({
  ttsProvider: 'google-ai', googleTtsRomanianOnly: true, googleTtsMobileEnglish: false,
}) }));
vi.mock('../api/backend', () => ({ apiFetch: vi.fn(), apiError: vi.fn() }));
vi.mock('../logic/ai-usage', () => ({ recordAiFailure: vi.fn(), recordAiUsage: vi.fn() }));
vi.mock('../events', () => ({ emit: vi.fn() }));

describe('native tutor speech', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.mode.mockResolvedValue();
    mocks.active.mockResolvedValue();
    mocks.stop.mockResolvedValue();
    mocks.speak.mockImplementation((_text, options) => options.onDone());
  });

  it('prepares and activates playback before the first English greeting without recording', async () => {
    const { speak } = await import('./tts');
    await speak('Hello! How are you today?');
    expect(mocks.mode).toHaveBeenCalledWith({
      playsInSilentMode: true, allowsRecording: false,
      shouldRouteThroughEarpiece: false, interruptionMode: 'doNotMix',
    });
    expect(mocks.active).toHaveBeenCalledWith(true);
    expect(mocks.mode.mock.invocationCallOrder[0]).toBeLessThan(mocks.active.mock.invocationCallOrder[0]);
    expect(mocks.active.mock.invocationCallOrder[0]).toBeLessThan(mocks.speak.mock.invocationCallOrder[0]);
    expect(mocks.speak).toHaveBeenCalledWith('Hello! How are you today?', expect.objectContaining({
      language: 'en-US', useApplicationAudioSession: true,
    }));
    await speak('Welcome back.');
    expect(mocks.mode).toHaveBeenCalledTimes(2);
  });

  it('does not start a greeting cancelled while the audio session is preparing', async () => {
    let release!: () => void;
    mocks.mode.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const { speak, stopSpeaking } = await import('./tts');
    const pending = speak('Hello!');
    await vi.waitFor(() => expect(mocks.mode).toHaveBeenCalled());
    stopSpeaking();
    release();
    await pending;
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(mocks.active).not.toHaveBeenCalled();
  });

  it('waits for the previous native stop before starting replacement speech', async () => {
    mocks.speak.mockImplementationOnce(() => {});
    const { speak } = await import('./tts');
    const first = speak('First message');
    await vi.waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1));
    let release!: () => void;
    mocks.stop.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const second = speak('Second message');
    await first;
    expect(mocks.speak).toHaveBeenCalledTimes(1);
    release();
    await second;
    expect(mocks.speak).toHaveBeenCalledTimes(2);
  });
});
