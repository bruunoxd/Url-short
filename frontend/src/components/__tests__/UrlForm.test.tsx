import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UrlForm from '../urls/UrlForm';
import '@testing-library/jest-dom';

describe('UrlForm Component', () => {
  const mockSubmit = jest.fn();

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  test('renders create form with required fields', () => {
    render(<UrlForm onSubmit={mockSubmit} isSubmitting={false} />);
    
    expect(screen.getByLabelText(/original url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expiration date/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create url/i })).toBeInTheDocument();
  });

  test('renders edit form with correct fields', () => {
    const initialData = {
      originalUrl: 'https://example.com',
      title: 'Test URL',
      tags: ['test', 'example'],
      isActive: true,
      expiresAt: '2025-12-31T23:59'
    };

    render(
      <UrlForm 
        onSubmit={mockSubmit} 
        isSubmitting={false} 
        initialData={initialData} 
        isEditMode={true} 
      />
    );
    
    // Original URL field should not be present in edit mode
    expect(screen.queryByLabelText(/original url/i)).not.toBeInTheDocument();
    
    expect(screen.getByLabelText(/title/i)).toHaveValue('Test URL');
    expect(screen.getByLabelText(/active/i)).toBeChecked();
    expect(screen.getByLabelText(/expiration date/i)).toHaveValue('2025-12-31T23:59');
    expect(screen.getByRole('button', { name: /update url/i })).toBeInTheDocument();
    
    // Check if tags are rendered
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('example')).toBeInTheDocument();
  });

  test('validates form on submission', async () => {
    render(<UrlForm onSubmit={mockSubmit} isSubmitting={false} />);
    
    // Submit without filling required fields
    fireEvent.click(screen.getByRole('button', { name: /create url/i }));
    
    // Check for validation error
    await waitFor(() => {
      expect(screen.getByText(/original url is required/i)).toBeInTheDocument();
    });
    
    // Fill with invalid URL
    fireEvent.change(screen.getByLabelText(/original url/i), {
      target: { value: 'not-a-valid-url' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /create url/i }));
    
    // Check for validation error
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument();
    });
    
    // Fill with valid URL
    fireEvent.change(screen.getByLabelText(/original url/i), {
      target: { value: 'https://example.com' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /create url/i }));
    
    // Check if onSubmit was called
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        title: undefined,
        tags: undefined,
        expiresAt: undefined,
      });
    });
  });

  test('adds and removes tags', () => {
    render(<UrlForm onSubmit={mockSubmit} isSubmitting={false} />);
    
    // Add a tag
    fireEvent.change(screen.getByLabelText(/tags/i), {
      target: { value: 'newtag' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: '' })); // Tag add button
    
    expect(screen.getByText('newtag')).toBeInTheDocument();
    
    // Add another tag
    fireEvent.change(screen.getByLabelText(/tags/i), {
      target: { value: 'another' },
    });
    
    // Add tag by pressing Enter
    fireEvent.keyDown(screen.getByLabelText(/tags/i), {
      key: 'Enter',
      code: 'Enter',
    });
    
    expect(screen.getByText('another')).toBeInTheDocument();
    
    // Remove a tag
    const removeButtons = screen.getAllByRole('button', { name: '' }).filter(
      button => button.classList.contains('ml-1.5')
    );
    
    fireEvent.click(removeButtons[0]); // Remove first tag
    
    expect(screen.queryByText('newtag')).not.toBeInTheDocument();
    expect(screen.getByText('another')).toBeInTheDocument();
  });

  test('disables form when submitting', () => {
    render(<UrlForm onSubmit={mockSubmit} isSubmitting={true} />);
    
    expect(screen.getByLabelText(/original url/i)).toBeDisabled();
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
    expect(screen.getByLabelText(/tags/i)).toBeDisabled();
    expect(screen.getByLabelText(/expiration date/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
  });
});