/**
 * @fileoverview Navigation sidebar component implementing Material Design 3.0 specifications
 * with responsive design, role-based access control, and accessibility features.
 * @version 1.0.0
 */

import React, { memo, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  useMediaQuery,
  useTheme as useMuiTheme,
  styled
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  PlayArrow as WorkflowIcon,
  Extension as IntegrationIcon,
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  Security as SecurityIcon,
  AccountCircle as ProfileIcon
} from '@mui/icons-material';

// Internal imports
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import {
  DASHBOARD_ROUTES,
  WORKFLOW_ROUTES,
  INTEGRATION_ROUTES,
  USER_ROUTES
} from '../../constants/routes';

// Constants
const DRAWER_WIDTH = 280;
const DRAWER_WIDTH_MOBILE = '100%';
const TRANSITION_DURATION = 225;

// Styled components
const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: DRAWER_WIDTH,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: DRAWER_WIDTH,
    boxSizing: 'border-box',
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: TRANSITION_DURATION,
    }),
    [theme.breakpoints.down('md')]: {
      width: DRAWER_WIDTH_MOBILE,
    },
  },
}));

// Interfaces
interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  roles: string[];
  order: number;
  ariaLabel: string;
}

/**
 * Navigation sidebar component with role-based access control and responsive design
 */
export const Sidebar = memo(({ open, onClose }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const { user, isAuthenticated } = useAuth();

  // Generate menu items based on user roles and authentication status
  const menuItems = useMemo(() => {
    const items: MenuItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <DashboardIcon />,
        path: DASHBOARD_ROUTES.DASHBOARD,
        roles: ['viewer', 'analyst', 'developer', 'team_lead', 'admin'],
        order: 1,
        ariaLabel: 'Navigate to dashboard'
      },
      {
        id: 'workflows',
        label: 'Workflows',
        icon: <WorkflowIcon />,
        path: WORKFLOW_ROUTES.LIST,
        roles: ['analyst', 'developer', 'team_lead', 'admin'],
        order: 2,
        ariaLabel: 'Manage workflows'
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: <IntegrationIcon />,
        path: INTEGRATION_ROUTES.LIST,
        roles: ['developer', 'team_lead', 'admin'],
        order: 3,
        ariaLabel: 'Configure integrations'
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: <AnalyticsIcon />,
        path: DASHBOARD_ROUTES.ANALYTICS,
        roles: ['analyst', 'team_lead', 'admin'],
        order: 4,
        ariaLabel: 'View analytics'
      }
    ];

    // Add settings and security for authenticated users
    if (isAuthenticated) {
      items.push(
        {
          id: 'profile',
          label: 'Profile',
          icon: <ProfileIcon />,
          path: USER_ROUTES.PROFILE,
          roles: ['viewer', 'analyst', 'developer', 'team_lead', 'admin'],
          order: 5,
          ariaLabel: 'View profile'
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: <SettingsIcon />,
          path: USER_ROUTES.SETTINGS,
          roles: ['team_lead', 'admin'],
          order: 6,
          ariaLabel: 'Manage settings'
        },
        {
          id: 'security',
          label: 'Security',
          icon: <SecurityIcon />,
          path: USER_ROUTES.SECURITY,
          roles: ['admin'],
          order: 7,
          ariaLabel: 'Security settings'
        }
      );
    }

    // Filter items based on user roles
    return items
      .filter(item => user?.roles.some(role => item.roles.includes(role)))
      .sort((a, b) => a.order - b.order);
  }, [isAuthenticated, user?.roles]);

  // Handle navigation with drawer close for mobile
  const handleNavigation = useCallback((path: string) => {
    navigate(path);
    if (isMobile) {
      onClose();
    }
  }, [navigate, isMobile, onClose]);

  return (
    <StyledDrawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={open}
      onClose={onClose}
      ModalProps={{
        keepMounted: true // Better mobile performance
      }}
      PaperProps={{
        elevation: isMobile ? 2 : 0,
        sx: {
          height: '100%',
          overflowX: 'hidden'
        }
      }}
      aria-label="Main navigation"
    >
      <List
        component="nav"
        aria-label="Navigation menu"
        sx={{
          p: theme.spacing(2, 1),
          '& .MuiListItemButton-root': {
            borderRadius: 1,
            mb: 0.5
          }
        }}
      >
        {menuItems.map((item) => (
          <ListItem key={item.id} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              aria-label={item.ariaLabel}
              sx={{
                minHeight: 48,
                px: 2.5,
                '&.Mui-selected': {
                  backgroundColor: theme.palette.action.selected,
                  '&:hover': {
                    backgroundColor: theme.palette.action.hover
                  }
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: location.pathname === item.path
                    ? theme.palette.primary.main
                    : theme.palette.text.secondary
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  color: location.pathname === item.path
                    ? 'primary'
                    : 'textPrimary'
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </StyledDrawer>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;