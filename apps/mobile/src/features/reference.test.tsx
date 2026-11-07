import { allText, draw } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { world } from '@/testing/world';
import { EducationList, ExamPractice } from './education';

// On a phone, a list it revalidated came back with an empty body, which closed the app.
describe('a shared list that comes back empty', () => {
  it('leaves the education library drawn, without the subspecialty filter', async () => {
    world.routes = { ...everything, 'GET /api/v1/subspecialties': {} };
    const drawn = await draw(<EducationList />);
    expect(allText(drawn)).toContain('All levels');
    expect(allText(drawn)).not.toContain('All subspecialties');
  });

  it('leaves exam practice drawn', async () => {
    world.routes = { ...everything, 'GET /api/v1/subspecialties': {} };
    const drawn = await draw(<ExamPractice />);
    expect(allText(drawn)).toContain('All levels');
  });
});
