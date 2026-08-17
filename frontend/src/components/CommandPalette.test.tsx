import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/'),
}))

describe('CommandPalette', () => {
  it('opens when Cmd+K is pressed', async () => {
    const mockRouter = { push: vi.fn() }
    ;(useRouter as any).mockReturnValue(mockRouter)

    render(<CommandPalette />)
    
    // Command palette should initially be closed
    expect(screen.queryByPlaceholderText('Type a command or search...')).not.toBeInTheDocument()

    // Press Cmd+K (using userEvent)
    const user = userEvent.setup()
    await user.keyboard('{Control>}k{/Control}')

    // Command palette should now be open
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument()
    })
  })
})
