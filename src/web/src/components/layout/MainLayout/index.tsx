/**
 * @fileoverview Main layout component implementing Material Design 3.0 specifications
 * with responsive behavior, theme support, and WCAG 2.1 Level AA compliance.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Container, useMediaQuery, Fade } from '@mui/material';
import { styled } from '@mui/material/styles';

// Internal imports
import Header from '../Header';
import Sidebar from '../Sidebar';
import Footer from '../Footer';
import { useTheme } from '../../../hooks/useTheme';

/**
 * Props interface for MainLayout component
 */
interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Styled container component for main content area with responsive behavior
 */
const MainContainer = styled(Container)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  minHeight: `calc(100vh - 64px - 68px)`, // Viewport height minus header and footer
  display: 'flex',
  flexDirection: 'column',
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: 225,
  }),
  marginLeft: {
    xs: 0,
    md: '240px', // Sidebar width
  },
  backgroundColor: theme.palette.background.default,
  [theme.breakpoints.down('md')]: {
    marginLeft: 0,
    padding: theme.spacing(2),
  },
}));

/**
 * Main layout component that provides the application's core structure
 * with responsive behavior and accessibility features.
 *
 * Features:
 * - Material Design 3.0 implementation
 * - Responsive sidebar with mobile support
 * - Theme-aware styling with smooth transitions
 * - WCAG 2.1 Level AA compliance
 * - Proper spacing using 8px grid system
 */
export const MainLayout = React.memo<MainLayoutProps>(({
  children,
  className,
  testId = 'main-layout',
}) => {
  // Theme and responsive hooks
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Sidebar state management
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Handle sidebar toggle with proper cleanup
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Handle sidebar state on screen resize
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // Handle theme-related document attributes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: 'background.default',
        transition: theme.transitions.create(['background-color'], {
          duration: theme.transitions.duration.standard,
        }),
      }}
      className={className}
      data-testid={testId}
      role="application"
    >
      {/* Header with theme toggle and navigation */}
      <Header
        onThemeToggle={toggleTheme}
        isDarkMode={isDarkMode}
        onMenuClick={handleSidebarToggle}
        aria-label="Main header"
      />

      {/* Navigation sidebar with responsive behavior */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        aria-label="Main navigation"
      />

      {/* Main content area with proper spacing */}
      <Fade in={true} timeout={300}>
        <MainContainer
          maxWidth="lg"
          component="main"
          role="main"
          aria-label="Main content"
        >
          {children}
        </MainContainer>
      </Fade>

      {/* Footer with theme-aware styling */}
      <Footer aria-label="Page footer" />
    </Box>
  );
});

// Display name for debugging
MainLayout.displayName = 'MainLayout';

export default MainLayout;