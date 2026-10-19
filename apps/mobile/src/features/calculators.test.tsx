import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { world } from '@/testing/world';
import { CalculatorScreen } from './calculators';

/** M30: a calculator on the phone, worked out on the phone; nothing is asked of the server. */
describe('calculators in the app', () => {
  it('works out an eGFR, refusing an age the equation is not for', async () => {
    world.routes = everything;
    await draw(<CalculatorScreen id="egfr" />);
    await fireEvent.changeText(screen.getByLabelText('Age (years)'), '17');
    await fireEvent.press(screen.getByLabelText('Male'));
    await fireEvent.changeText(screen.getByLabelText('Serum creatinine (mg/dL)'), '1');
    await fireEvent.press(screen.getByLabelText('Calculate'));
    expect(allText(screen)).toContain('Enter a number from 18 to 120 years.');

    await fireEvent.changeText(screen.getByLabelText('Age (years)'), '60');
    await fireEvent.press(screen.getByLabelText('Calculate'));
    const text = allText(screen);
    expect(text).toMatch(/ 86\s+mL\/min\/1\.73 m²/);
    expect(text).toContain('G2: mildly decreased (60 to 89).');
    expect(text).toContain('Checked by Dr. Dahamshy on October 19, 2026.');
    expect(world.calls).toEqual([]);
  });

  it('says in Hebrew that the IPSS wording is not validated', async () => {
    world.routes = everything;
    const text = allText(await draw(<CalculatorScreen id="ipss" />, 'he'));
    expect(text).toContain('הנוסח העברי של השאלון הזה הוא שלנו, ואינו תרגום מתוקף.');
  });

  it('says so when there is no such calculator', async () => {
    world.routes = everything;
    expect(allText(await draw(<CalculatorScreen id="tnm" />))).toContain('Page not found');
  });
});
