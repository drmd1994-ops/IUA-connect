import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw } from '@/testing/draw';
import { Crashed } from './crashed';

describe('a screen that broke', () => {
  it('says what broke, and goes back to the app', async () => {
    const retry = jest.fn(() => Promise.resolve());
    const drawn = await draw(
      <Crashed error={new TypeError("Cannot read property 'title' of undefined")} retry={retry} />,
    );
    expect(allText(drawn)).toContain('Something went wrong on this screen');
    expect(allText(drawn)).toContain("Details: Cannot read property 'title' of undefined");
    await fireEvent.press(screen.getByLabelText('Back to the app'));
    expect(retry).toHaveBeenCalled();
  });
});
