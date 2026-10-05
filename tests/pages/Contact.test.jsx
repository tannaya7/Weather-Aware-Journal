import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Contact } from '../../src/pages/Contact.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';

describe('Contact page', () => {
  it('shows the page heading and a mailto link', () => {
    render(
      <ThemeProvider>
        <Contact />
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Get in touch' })).toBeInTheDocument();

    const email = screen.getByRole('link', { name: /@/ });
    expect(email.getAttribute('href')).toMatch(/^mailto:\S+@\S+$/);
    expect(email.getAttribute('href')).toBe(`mailto:${email.textContent}`);
  });

  it('includes the theme toggle in the header', () => {
    render(
      <ThemeProvider>
        <Contact />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: /switch to (light|dark) theme/i })).toBeInTheDocument();
  });
});
