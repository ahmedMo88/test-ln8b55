/**
 * @fileoverview A responsive, accessible footer component implementing Material Design 3.0
 * specifications with theme-aware styling and proper spacing system.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { Box, Container, Typography, Link, useMediaQuery } from '@mui/material'; // v5.14.0
import { useTheme as useMuiTheme } from '@mui/material/styles'; // v5.14.0
import useTheme from '../../../hooks/useTheme';

/**
 * Props interface for Footer component
 */
interface FooterProps {
  className?: string;
}

/**
 * A responsive, accessible footer component providing copyright information and navigation links
 * while maintaining consistent spacing and mobile-first responsive behavior.
 *
 * Features:
 * - Implements Material Design 3.0 specifications
 * - Responsive layout with mobile-first approach
 * - WCAG 2.1 Level AA compliant
 * - Theme-aware styling with smooth transitions
 * - Proper spacing using 8px grid system
 *
 * @param {FooterProps} props - Component props
 * @returns {JSX.Element} Rendered footer component
 */
export const Footer: React.FC<FooterProps> = React.memo(({ className }) => {
  // Theme hooks for styling and responsive behavior
  const muiTheme = useMuiTheme();
  const { theme, isDarkMode } = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));

  // Current year for copyright
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        py: { xs: 2, sm: 3 }, // Responsive padding
        mt: 'auto', // Push to bottom of flex container
        bgcolor: 'background.paper',
        transition: theme.transitions.create(['background-color', 'border-color'], {
          duration: theme.transitions.duration.standard,
        }),
      }}
      className={className}
      role="contentinfo"
      aria-label="Site footer"
    >
      <Container
        maxWidth="lg"
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: { xs: 2, sm: 3 },
        }}
      >
        {/* Copyright text */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            textAlign: { xs: 'center', sm: 'left' },
            transition: theme.transitions.create('color'),
          }}
        >
          © {currentYear} Workflow Automation Platform. All rights reserved.
        </Typography>

        {/* Navigation links */}
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 2, sm: 3 },
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: { xs: 'center', sm: 'flex-end' },
          }}
        >
          <Link
            href="/privacy"
            color="text.secondary"
            underline="hover"
            sx={{ 
              transition: theme.transitions.create('color'),
              '&:hover': { color: 'primary.main' },
            }}
            onClick={(e) => {
              // Handle navigation while preserving accessibility
              if (!(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // Add your navigation logic here
              }
            }}
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            color="text.secondary"
            underline="hover"
            sx={{ 
              transition: theme.transitions.create('color'),
              '&:hover': { color: 'primary.main' },
            }}
            onClick={(e) => {
              if (!(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // Add your navigation logic here
              }
            }}
          >
            Terms of Service
          </Link>
          <Link
            href="/contact"
            color="text.secondary"
            underline="hover"
            sx={{ 
              transition: theme.transitions.create('color'),
              '&:hover': { color: 'primary.main' },
            }}
            onClick={(e) => {
              if (!(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // Add your navigation logic here
              }
            }}
          >
            Contact Us
          </Link>
        </Box>
      </Container>
    </Box>
  );
});

// Display name for debugging
Footer.displayName = 'Footer';

// Default export
export default Footer;