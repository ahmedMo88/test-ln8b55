/**
 * @fileoverview Main application header component implementing Material Design 3.0
 * with comprehensive security features, accessibility support, and theme switching.
 * @version 1.0.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Avatar,
  Skeleton,
  Tooltip,
  Box,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  MenuIcon,
  HelpOutline,
  Brightness4,
  Brightness7,
  AccountCircle,
} from '@mui/icons-material';

// Internal imports
import { useAuth } from '../../../hooks/useAuth';
import CustomButton from '../../common/Button';
import { DASHBOARD_ROUTES, USER_ROUTES } from '../../../constants/routes';

/**
 * Header component props interface with theme and accessibility support
 */
interface HeaderProps {
  onThemeToggle: () => void;
  isDarkMode: boolean;
  'aria-label'?: string;
  role?: string;
}

/**
 * Styled AppBar component with theme-aware styling
 */
const StyledAppBar = styled(AppBar)(({ theme }) => ({
  boxShadow: 'none',
  borderBottom: '1px solid',
  borderColor: theme.palette.divider,
  transition: 'all 0.3s ease-in-out',
  backgroundColor: theme.palette.background.paper,
}));

/**
 * Main application header component with theme switching and accessibility
 */
export const Header: React.FC<HeaderProps> = ({
  onThemeToggle,
  isDarkMode,
  'aria-label': ariaLabel = 'Main navigation',
  role = 'banner',
}) => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuId = 'primary-user-menu';
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setAnchorEl(null);
    };
  }, []);

  /**
   * Handle menu open with keyboard support
   */
  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  /**
   * Handle menu close with cleanup
   */
  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  /**
   * Handle secure navigation to profile/settings
   */
  const handleNavigation = useCallback((route: string) => {
    handleMenuClose();
    navigate(route);
  }, [navigate, handleMenuClose]);

  /**
   * Handle logout with proper error handling
   */
  const handleLogout = useCallback(async () => {
    try {
      await logout();
      handleMenuClose();
      navigate(DASHBOARD_ROUTES.HOME);
    } catch (error) {
      console.error('Logout failed:', error);
      // Error handling could be expanded based on requirements
    }
  }, [logout, navigate, handleMenuClose]);

  return (
    <StyledAppBar position="fixed" aria-label={ariaLabel} role={role}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: 64 }}>
        {/* Navigation menu button */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Open navigation menu"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          {/* Application title */}
          <Typography
            variant="h6"
            component="h1"
            sx={{
              fontWeight: 500,
              fontFamily: (theme) => theme.typography.fontFamily,
              color: (theme) => theme.palette.text.primary,
            }}
          >
            Workflow Automation
          </Typography>
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Theme toggle */}
          <Tooltip title={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}>
            <IconButton
              color="inherit"
              onClick={onThemeToggle}
              aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
            >
              {isDarkMode ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Tooltip>

          {/* Help button */}
          <Tooltip title="Help">
            <IconButton
              color="inherit"
              aria-label="Open help menu"
              onClick={() => navigate('/help')}
            >
              <HelpOutline />
            </IconButton>
          </Tooltip>

          {/* User profile section */}
          {isLoading ? (
            <Skeleton variant="circular" width={40} height={40} />
          ) : isAuthenticated && user ? (
            <>
              <IconButton
                ref={menuButtonRef}
                aria-label="Account settings"
                aria-controls={menuId}
                aria-haspopup="true"
                aria-expanded={Boolean(anchorEl)}
                onClick={handleMenuOpen}
                color="inherit"
              >
                {user.firstName ? (
                  <Avatar
                    alt={`${user.firstName} ${user.lastName}`}
                    src={user.avatarUrl}
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: (theme) => theme.palette.primary.main,
                    }}
                  >
                    {user.firstName[0]}
                  </Avatar>
                ) : (
                  <AccountCircle />
                )}
              </IconButton>
              <Menu
                id={menuId}
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                keepMounted
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{
                  elevation: 0,
                  sx: {
                    mt: 1.5,
                    overflow: 'visible',
                    filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                    '& .MuiAvatar-root': {
                      width: 32,
                      height: 32,
                      ml: -0.5,
                      mr: 1,
                    },
                  },
                }}
              >
                <MenuItem onClick={() => handleNavigation(USER_ROUTES.PROFILE)}>
                  Profile
                </MenuItem>
                <MenuItem onClick={() => handleNavigation(USER_ROUTES.SETTINGS)}>
                  Settings
                </MenuItem>
                <MenuItem onClick={handleLogout}>Logout</MenuItem>
              </Menu>
            </>
          ) : (
            <CustomButton
              variant="contained"
              color="primary"
              onClick={() => navigate('/auth/login')}
              aria-label="Sign in"
            >
              Sign In
            </CustomButton>
          )}
        </Box>
      </Toolbar>
    </StyledAppBar>
  );
};

export default Header;