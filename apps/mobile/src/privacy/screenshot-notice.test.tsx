import { Alert } from 'react-native';
import { draw } from '@/testing/draw';
import { ScreenshotNotice } from './screenshot-notice';

// Jest lets a mock reach only variables whose names start with "mock".
const mockListeners: (() => void)[] = [];
const mockRemove = jest.fn();
const mockModule = { present: true };

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  requireOptionalNativeModule: () =>
    mockModule.present
      ? {
          addListener: (_event: string, listener: () => void) => {
            mockListeners.push(listener);
            return { remove: mockRemove };
          },
        }
      : null,
}));

describe('after a screenshot (M37)', () => {
  beforeEach(() => {
    mockListeners.length = 0;
    mockRemove.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('on an iPhone, says screenshots are blocked, in the person’s language', async () => {
    mockModule.present = true;
    const drawn = await draw(<ScreenshotNotice />, 'he');
    expect(mockListeners).toHaveLength(1);
    mockListeners[0]?.();
    expect(Alert.alert).toHaveBeenCalledWith(
      'צילומי מסך חסומים',
      'צילומי מסך של מד קונקט יוצאים ריקים, כדי לשמור על פרטיות מה שמשותף באפליקציה.',
    );
    await drawn.unmount();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('on Android, where there is no such module, does nothing', async () => {
    mockModule.present = false;
    await draw(<ScreenshotNotice />);
    expect(mockListeners).toHaveLength(0);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
