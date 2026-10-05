import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ImageGallery } from '../../src/components/ImageGallery/ImageGallery.jsx';

const IMG = 'data:image/png;base64,AAAA';

function renderGallery(entries) {
  return render(
    <MemoryRouter>
      <ImageGallery entries={entries} />
    </MemoryRouter>,
  );
}

describe('ImageGallery', () => {
  it('renders nothing when no entry has a photo', () => {
    const { container } = renderGallery([{ id: 1, content: 'No photo', date: '2026-01-01T10:00:00' }]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only entries with photos, newest first, linking to each entry', () => {
    renderGallery([
      { id: 1, content: 'Older trip', image: IMG, date: '2026-01-01T10:00:00' },
      { id: 2, content: 'No photo here', date: '2026-02-01T10:00:00' },
      { id: 3, content: 'Newer trip', image: IMG, date: '2026-03-01T10:00:00' },
    ]);

    expect(screen.getByRole('heading', { name: 'Snapshots' })).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName('Read entry: Newer trip');
    expect(links[0]).toHaveAttribute('href', '/entry/3');
    expect(links[1]).toHaveAccessibleName('Read entry: Older trip');
    expect(links[1]).toHaveAttribute('href', '/entry/1');
  });

  it('uses the entry photo as a decorative image', () => {
    renderGallery([{ id: 1, content: 'Beach', image: IMG, date: '2026-01-01T10:00:00' }]);

    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', IMG);
    expect(img).toHaveAttribute('alt', '');
  });

  it('does not reorder the entries array it was given', () => {
    const entries = [
      { id: 1, content: 'a', image: IMG, date: '2026-01-01T10:00:00' },
      { id: 2, content: 'b', image: IMG, date: '2026-03-01T10:00:00' },
    ];
    renderGallery(entries);
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
  });

  it('uses the first of several photos and shows how many more there are', () => {
    renderGallery([
      { id: 1, content: 'Hike', images: ['data:first', 'data:second', 'data:third'], date: '2026-01-01T10:00:00' },
    ]);

    expect(document.querySelector('img')).toHaveAttribute('src', 'data:first');
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAccessibleName('Read entry: Hike (3 photos)');
  });
});
