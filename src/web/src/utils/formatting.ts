/**
 * @fileoverview Utility functions for formatting various data types with enhanced
 * accessibility and localization support following Material Design 3.0 principles.
 * @version 1.0.0
 */

import { format } from 'date-fns'; // v2.30.0
import { 
  WorkflowStatus, 
  ExecutionStatus 
} from '../types/workflow.types';
import { 
  NodeType, 
  NodeStatus 
} from '../types/node.types';

/**
 * Interface for status formatting return type
 */
interface FormattedStatus {
  text: string;
  className: string;
  ariaLabel: string;
  tooltipText: string;
}

/**
 * Formats a date string or Date object into a human-readable format with 
 * timezone and localization support
 * 
 * @param date - Date to format
 * @param formatString - Format pattern to use
 * @param locale - Locale for formatting
 * @returns Formatted date string or placeholder
 */
export const formatDate = (
  date: Date | string | null,
  formatString: string = 'MMM d, yyyy h:mm a',
  locale: Locale
): string => {
  if (!date) {
    return '—'; // Em dash for empty dates
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const formattedDate = format(dateObj, formatString, { locale });
    
    // Add ARIA time attribute for accessibility
    return `<time datetime="${dateObj.toISOString()}">${formattedDate}</time>`;
  } catch (error) {
    console.error('Date formatting error:', error);
    return '—';
  }
};

/**
 * Formats execution status with semantic styling and accessibility support
 * 
 * @param status - Execution status to format
 * @returns Formatted status object with styling and accessibility attributes
 */
export const formatExecutionStatus = (status: ExecutionStatus): FormattedStatus => {
  const statusMap: Record<ExecutionStatus, FormattedStatus> = {
    pending: {
      text: 'Pending',
      className: 'status-pending md-amber-100',
      ariaLabel: 'Execution status: Pending',
      tooltipText: 'Workflow execution is pending'
    },
    running: {
      text: 'Running',
      className: 'status-running md-blue-100',
      ariaLabel: 'Execution status: Currently running',
      tooltipText: 'Workflow is currently executing'
    },
    completed: {
      text: 'Completed',
      className: 'status-completed md-green-100',
      ariaLabel: 'Execution status: Completed successfully',
      tooltipText: 'Workflow completed successfully'
    },
    failed: {
      text: 'Failed',
      className: 'status-failed md-red-100',
      ariaLabel: 'Execution status: Failed',
      tooltipText: 'Workflow execution failed'
    }
  };

  return statusMap[status];
};

/**
 * Formats node status with semantic styling and accessibility support
 * 
 * @param status - Node status to format
 * @returns Formatted status object with styling and accessibility attributes
 */
export const formatNodeStatus = (status: NodeStatus): FormattedStatus => {
  const statusMap: Record<NodeStatus, FormattedStatus> = {
    idle: {
      text: 'Idle',
      className: 'node-idle md-grey-100',
      ariaLabel: 'Node status: Idle',
      tooltipText: 'Node is idle and ready'
    },
    running: {
      text: 'Running',
      className: 'node-running md-blue-100',
      ariaLabel: 'Node status: Currently running',
      tooltipText: 'Node is currently executing'
    },
    completed: {
      text: 'Completed',
      className: 'node-completed md-green-100',
      ariaLabel: 'Node status: Completed successfully',
      tooltipText: 'Node completed successfully'
    },
    error: {
      text: 'Error',
      className: 'node-error md-red-100',
      ariaLabel: 'Node status: Error',
      tooltipText: 'Node encountered an error'
    },
    warning: {
      text: 'Warning',
      className: 'node-warning md-orange-100',
      ariaLabel: 'Node status: Warning',
      tooltipText: 'Node completed with warnings'
    },
    disabled: {
      text: 'Disabled',
      className: 'node-disabled md-grey-300',
      ariaLabel: 'Node status: Disabled',
      tooltipText: 'Node is currently disabled'
    }
  };

  return statusMap[status];
};

/**
 * Formats duration with intelligent unit selection and localization
 * 
 * @param milliseconds - Duration in milliseconds
 * @param locale - Locale for formatting
 * @returns Localized duration string with appropriate units
 */
export const formatDuration = (milliseconds: number, locale: string): string => {
  if (milliseconds < 0) {
    return '—';
  }

  const units: [number, string][] = [
    [1000 * 60 * 60 * 24, 'day'],
    [1000 * 60 * 60, 'hour'],
    [1000 * 60, 'minute'],
    [1000, 'second']
  ];

  // Find most appropriate unit
  const [divisor, unit] = units.find(([d]) => milliseconds >= d) || [1000, 'second'];
  const value = Math.round(milliseconds / divisor);

  // Format with localization
  const formatter = new Intl.RelativeTimeFormat(locale, { 
    numeric: 'always',
    style: 'long'
  });

  // Add ARIA time attribute for accessibility
  return `<time datetime="PT${milliseconds / 1000}S">
    ${formatter.format(value, unit as Intl.RelativeTimeFormatUnit)}
  </time>`;
};

/**
 * Formats node type for display with semantic meaning
 * 
 * @param type - Node type to format
 * @returns Formatted node type string
 */
export const formatNodeType = (type: NodeType): string => {
  const typeMap: Record<NodeType, string> = {
    trigger: 'Trigger',
    action: 'Action',
    condition: 'Condition',
    ai_task: 'AI Task'
  };

  return typeMap[type];
};

/**
 * Formats workflow status with semantic styling
 * 
 * @param status - Workflow status to format
 * @returns Formatted status object with styling and accessibility attributes
 */
export const formatWorkflowStatus = (status: WorkflowStatus): FormattedStatus => {
  const statusMap: Record<WorkflowStatus, FormattedStatus> = {
    draft: {
      text: 'Draft',
      className: 'workflow-draft md-grey-100',
      ariaLabel: 'Workflow status: Draft',
      tooltipText: 'Workflow is in draft state'
    },
    active: {
      text: 'Active',
      className: 'workflow-active md-green-100',
      ariaLabel: 'Workflow status: Active',
      tooltipText: 'Workflow is active and running'
    },
    paused: {
      text: 'Paused',
      className: 'workflow-paused md-amber-100',
      ariaLabel: 'Workflow status: Paused',
      tooltipText: 'Workflow is temporarily paused'
    },
    archived: {
      text: 'Archived',
      className: 'workflow-archived md-grey-300',
      ariaLabel: 'Workflow status: Archived',
      tooltipText: 'Workflow is archived'
    }
  };

  return statusMap[status];
};