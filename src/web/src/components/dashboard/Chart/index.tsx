/**
 * @fileoverview A responsive and accessible chart component for visualizing workflow execution metrics
 * with real-time updates and comprehensive analytics support.
 * @version 1.0.0
 */

import React, { useMemo, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { WorkflowExecution } from '../../../types/workflow.types';
import { SPACING } from '../../../constants/theme';
import Loading from '../../common/Loading';

// Chart type definitions
type ChartType = 'success-rate' | 'execution-time' | 'adoption-rate';

/**
 * Interface for chart configuration options
 */
interface ChartOptions {
  timeRange?: 'hour' | 'day' | 'week' | 'month';
  aggregation?: 'sum' | 'average' | 'count';
  showGrid?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

/**
 * Props interface for the Chart component
 */
interface ChartProps {
  data: WorkflowExecution[];
  title: string;
  loading?: boolean;
  type: ChartType;
  refreshInterval?: number;
  options?: ChartOptions;
}

/**
 * Interface for processed chart data points
 */
interface ProcessedChartData {
  timestamp: string;
  value: number;
  successRate?: number;
  executionTime?: number;
  adoptionRate?: number;
}

/**
 * Default chart options
 */
const DEFAULT_OPTIONS: ChartOptions = {
  timeRange: 'day',
  aggregation: 'average',
  showGrid: true,
  showLegend: true,
  animate: true,
  yAxisLabel: 'Value',
  xAxisLabel: 'Time'
};

/**
 * Processes raw workflow execution data into chart-friendly format
 */
const processChartData = (
  executions: WorkflowExecution[],
  type: ChartType,
  options: ChartOptions
): ProcessedChartData[] => {
  if (!executions.length) return [];

  const timeRangeMap = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };

  const timeRange = timeRangeMap[options.timeRange || 'day'];
  const now = new Date().getTime();
  const startTime = now - timeRange;

  // Filter executions within time range
  const filteredExecutions = executions.filter(
    exec => new Date(exec.startTime).getTime() >= startTime
  );

  // Group executions by time intervals
  const groupedData = filteredExecutions.reduce((acc, exec) => {
    const timestamp = new Date(exec.startTime).toISOString();
    const interval = timestamp.slice(0, options.timeRange === 'hour' ? 13 : 10);

    if (!acc[interval]) {
      acc[interval] = {
        total: 0,
        success: 0,
        executionTime: 0,
        count: 0
      };
    }

    acc[interval].count++;
    acc[interval].total++;
    
    if (exec.status === 'completed') {
      acc[interval].success++;
      acc[interval].executionTime += exec.duration || 0;
    }

    return acc;
  }, {} as Record<string, { total: number; success: number; executionTime: number; count: number }>);

  // Transform grouped data based on chart type
  return Object.entries(groupedData).map(([timestamp, data]) => {
    const baseData = { timestamp };
    
    switch (type) {
      case 'success-rate':
        return {
          ...baseData,
          value: (data.success / data.total) * 100,
          successRate: (data.success / data.total) * 100
        };
      case 'execution-time':
        return {
          ...baseData,
          value: data.executionTime / data.count,
          executionTime: data.executionTime / data.count
        };
      case 'adoption-rate':
        return {
          ...baseData,
          value: (data.total / executions.length) * 100,
          adoptionRate: (data.total / executions.length) * 100
        };
      default:
        return baseData;
    }
  });
};

/**
 * Chart component for visualizing workflow execution metrics
 */
export const Chart: React.FC<ChartProps> = React.memo(({
  data,
  title,
  loading = false,
  type,
  refreshInterval = 30000,
  options = DEFAULT_OPTIONS
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Process chart data with memoization
  const processedData = useMemo(() => 
    processChartData(data, type, options),
    [data, type, options]
  );

  // Configure chart colors based on theme
  const chartColors = useMemo(() => ({
    grid: theme.palette.mode === 'light' 
      ? theme.palette.grey[200] 
      : theme.palette.grey[800],
    line: theme.palette.primary.main,
    text: theme.palette.text.primary
  }), [theme]);

  // Handle auto-refresh
  useEffect(() => {
    if (!refreshInterval) return;

    const intervalId = setInterval(() => {
      // Trigger refresh callback if provided
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Format tooltip values
  const formatTooltipValue = useCallback((value: number, type: ChartType) => {
    switch (type) {
      case 'success-rate':
      case 'adoption-rate':
        return `${value.toFixed(1)}%`;
      case 'execution-time':
        return `${value.toFixed(2)}ms`;
      default:
        return value.toString();
    }
  }, []);

  if (loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        height={400}
      >
        <Loading size="large" />
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        p: SPACING.unit,
        height: 400,
        width: '100%'
      }}
    >
      <Typography 
        variant="h6" 
        component="h2" 
        gutterBottom
        sx={{ mb: SPACING.unit * 2 }}
      >
        {title}
      </Typography>
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={processedData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5
          }}
        >
          {options.showGrid && (
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={chartColors.grid}
            />
          )}
          
          <XAxis
            dataKey="timestamp"
            stroke={chartColors.text}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={{
              value: options.xAxisLabel,
              position: 'insideBottom',
              offset: -10
            }}
          />
          
          <YAxis
            stroke={chartColors.text}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={{
              value: options.yAxisLabel,
              angle: -90,
              position: 'insideLeft'
            }}
          />
          
          <Tooltip
            formatter={(value: number) => formatTooltipValue(value, type)}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`
            }}
          />
          
          {options.showLegend && (
            <Legend 
              verticalAlign="top" 
              height={36}
            />
          )}
          
          <Line
            type="monotone"
            dataKey="value"
            stroke={chartColors.line}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
            animationDuration={options.animate ? 1500 : 0}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
});

Chart.displayName = 'Chart';

export default Chart;