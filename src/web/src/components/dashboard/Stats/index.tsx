/**
 * @fileoverview Real-time dashboard statistics component with WebSocket updates
 * and accessibility features following Material Design guidelines.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Grid, Typography, Box, Tooltip, CircularProgress } from '@mui/material'; // v5.14.0
import { 
  TrendingUp, 
  TrendingDown, 
  PlayArrow, 
  Error, 
  Refresh 
} from '@mui/icons-material'; // v5.14.0

// Internal imports
import Card from '../../common/Card';
import WorkflowService from '../../../services/workflow.service';
import useWebSocket from '../../../hooks/useWebSocket';

// Types for component props
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend: number;
  color: string;
  isLoading: boolean;
  lastUpdated: Date;
  ariaLabel: string;
}

interface DashboardStatsProps {
  workflowService: WorkflowService;
  refreshInterval?: number;
  onError?: (error: Error) => void;
}

/**
 * Individual statistic card component with real-time updates and accessibility
 */
const StatCard = React.memo<StatCardProps>(({
  title,
  value,
  icon,
  trend,
  color,
  isLoading,
  lastUpdated,
  ariaLabel
}) => {
  // Format trend value for display
  const trendDisplay = useMemo(() => {
    const prefix = trend > 0 ? '+' : '';
    return `${prefix}${trend.toFixed(1)}%`;
  }, [trend]);

  // Get trend icon based on value
  const trendIcon = useMemo(() => {
    if (trend > 0) return <TrendingUp />;
    if (trend < 0) return <TrendingDown />;
    return <PlayArrow />;
  }, [trend]);

  return (
    <Card elevation={1} ariaLabel={ariaLabel}>
      <Box sx={styles.statCard}>
        {isLoading && (
          <Box sx={styles.loadingOverlay}>
            <CircularProgress size={24} />
          </Box>
        )}
        
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography 
            variant="subtitle1" 
            color="textSecondary"
            component="h3"
          >
            {title}
          </Typography>
          {icon}
        </Box>

        <Typography 
          variant="h3" 
          component="div" 
          sx={styles.statValue}
          aria-live="polite"
        >
          {value.toLocaleString()}
        </Typography>

        <Tooltip 
          title={`Last updated: ${lastUpdated.toLocaleTimeString()}`}
          arrow
        >
          <Box 
            sx={{
              ...styles.trendIndicator,
              color: trend > 0 ? 'success.main' : trend < 0 ? 'error.main' : 'info.main'
            }}
          >
            {trendIcon}
            <Typography variant="body2" component="span">
              {trendDisplay}
            </Typography>
          </Box>
        </Tooltip>
      </Box>
    </Card>
  );
});

StatCard.displayName = 'StatCard';

/**
 * Main dashboard statistics component with real-time updates
 */
export const DashboardStats: React.FC<DashboardStatsProps> = ({
  workflowService,
  refreshInterval = 30000,
  onError
}) => {
  // State management
  const [stats, setStats] = useState({
    totalWorkflows: 0,
    activeWorkflows: 0,
    successfulExecutions: 0,
    failedExecutions: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [trends, setTrends] = useState({
    totalWorkflows: 0,
    activeWorkflows: 0,
    successfulExecutions: 0,
    failedExecutions: 0
  });

  // WebSocket connection for real-time updates
  const { isConnected, execution } = useWebSocket();

  /**
   * Fetches initial statistics data
   */
  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const [workflows, executions] = await Promise.all([
        workflowService.getWorkflows(),
        workflowService.getExecutions()
      ]);

      // Calculate new stats
      const newStats = {
        totalWorkflows: workflows.length,
        activeWorkflows: workflows.filter(w => w.status === 'active').length,
        successfulExecutions: executions.filter(e => e.status === 'completed').length,
        failedExecutions: executions.filter(e => e.status === 'failed').length
      };

      // Calculate trends
      const newTrends = {
        totalWorkflows: calculateTrend(stats.totalWorkflows, newStats.totalWorkflows),
        activeWorkflows: calculateTrend(stats.activeWorkflows, newStats.activeWorkflows),
        successfulExecutions: calculateTrend(stats.successfulExecutions, newStats.successfulExecutions),
        failedExecutions: calculateTrend(stats.failedExecutions, newStats.failedExecutions)
      };

      setStats(newStats);
      setTrends(newTrends);
      setLastUpdated(new Date());
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [workflowService, onError, stats]);

  /**
   * Calculates percentage trend between old and new values
   */
  const calculateTrend = (oldValue: number, newValue: number): number => {
    if (oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
  };

  // Initial data fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Setup refresh interval
  useEffect(() => {
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchStats, refreshInterval]);

  // Handle real-time execution updates
  useEffect(() => {
    if (execution) {
      setStats(prev => ({
        ...prev,
        successfulExecutions: execution.status === 'completed' 
          ? prev.successfulExecutions + 1 
          : prev.successfulExecutions,
        failedExecutions: execution.status === 'failed'
          ? prev.failedExecutions + 1
          : prev.failedExecutions
      }));
      setLastUpdated(new Date());
    }
  }, [execution]);

  return (
    <Grid container spacing={3} sx={styles.statsGrid}>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Total Workflows"
          value={stats.totalWorkflows}
          icon={<Refresh color="primary" />}
          trend={trends.totalWorkflows}
          color="primary.main"
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          ariaLabel="Total number of workflows"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Active Workflows"
          value={stats.activeWorkflows}
          icon={<PlayArrow color="success" />}
          trend={trends.activeWorkflows}
          color="success.main"
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          ariaLabel="Number of active workflows"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Successful Executions"
          value={stats.successfulExecutions}
          icon={<TrendingUp color="success" />}
          trend={trends.successfulExecutions}
          color="success.main"
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          ariaLabel="Number of successful workflow executions"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Failed Executions"
          value={stats.failedExecutions}
          icon={<Error color="error" />}
          trend={trends.failedExecutions}
          color="error.main"
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          ariaLabel="Number of failed workflow executions"
        />
      </Grid>
    </Grid>
  );
};

// Styles
const styles = {
  statsGrid: {
    padding: '24px',
    gap: '24px',
    minHeight: '200px'
  },
  statCard: {
    padding: '16px',
    minHeight: '120px',
    transition: 'all 0.3s ease-in-out',
    position: 'relative'
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginTop: '8px',
    animation: 'fadeIn 0.3s ease-in-out'
  },
  trendIndicator: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '8px',
    gap: '4px',
    transition: 'color 0.3s ease-in-out'
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '8px'
  }
} as const;

export default DashboardStats;