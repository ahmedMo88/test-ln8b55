/**
 * @fileoverview Enterprise-grade table component implementing Material Design 3.0 specifications
 * with comprehensive accessibility features, responsive design, and performance optimizations.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Paper,
  useMediaQuery
} from '@mui/material'; // v5.14.0
import { Loading } from '../Loading';
import { useTheme } from '../../../hooks/useTheme';

// Constants for table configuration
const DEFAULT_ROWS_PER_PAGE = 10;
const DEFAULT_ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];
const SORT_ARIA_LABEL = 'Click to sort by {column}';
const PAGE_ARIA_LABEL = 'Go to page {page}';
const ROW_ARIA_LABEL = 'Click to select row';

/**
 * Interface for column definition with comprehensive configuration options
 */
export interface ColumnDefinition {
  id: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => React.ReactNode;
  hide?: boolean | 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  headerStyle?: React.CSSProperties;
  cellStyle?: React.CSSProperties | ((value: any) => React.CSSProperties);
}

/**
 * Interface for table component props with extensive customization options
 */
export interface TableProps {
  data: Array<Record<string, any>>;
  columns: Array<ColumnDefinition>;
  loading?: boolean;
  pagination?: boolean;
  rowsPerPageOptions?: number[];
  stickyHeader?: boolean;
  initialSort?: string;
  sortDirection?: 'asc' | 'desc';
  ariaLabel?: string;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  onPageChange?: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  onRowClick?: (row: Record<string, any>) => void;
}

/**
 * Enhanced table component with comprehensive accessibility features,
 * responsive design, and performance optimizations.
 */
export const CustomTable: React.FC<TableProps> = React.memo(({
  data,
  columns,
  loading = false,
  pagination = true,
  rowsPerPageOptions = DEFAULT_ROWS_PER_PAGE_OPTIONS,
  stickyHeader = true,
  initialSort,
  sortDirection: initialSortDirection = 'asc',
  ariaLabel = 'Data table',
  onSort,
  onPageChange,
  onRowsPerPageChange,
  onRowClick
}) => {
  // Theme and responsive hooks
  const { theme, isDarkMode } = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isLaptop = useMediaQuery(theme.breakpoints.down('lg'));

  // State management
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [sortBy, setSortBy] = useState<string | undefined>(initialSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDirection);

  // Filter visible columns based on responsive breakpoints
  const visibleColumns = useMemo(() => {
    return columns.filter(column => {
      if (!column.hide) return true;
      if (column.hide === true) return false;
      if (column.hide === 'sm' && isMobile) return false;
      if (column.hide === 'md' && (isMobile || isTablet)) return false;
      if (column.hide === 'lg' && (isMobile || isTablet || isLaptop)) return false;
      return true;
    });
  }, [columns, isMobile, isTablet, isLaptop]);

  // Handle sort column change
  const handleSort = useCallback((columnId: string) => {
    const newDirection = sortBy === columnId && sortDir === 'asc' ? 'desc' : 'asc';
    setSortBy(columnId);
    setSortDir(newDirection);
    onSort?.(columnId, newDirection);

    // Announce sort change to screen readers
    const column = columns.find(col => col.id === columnId);
    if (column) {
      const message = `Table sorted by ${column.label} in ${newDirection}ending order`;
      const announcer = document.getElementById('table-live-region');
      if (announcer) announcer.textContent = message;
    }
  }, [sortBy, sortDir, columns, onSort]);

  // Handle page change
  const handlePageChange = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
    onPageChange?.(newPage);

    // Manage focus for accessibility
    const table = document.querySelector('[role="grid"]');
    if (table) {
      const firstCell = table.querySelector('td');
      if (firstCell instanceof HTMLElement) firstCell.focus();
    }
  }, [onPageChange]);

  // Handle rows per page change
  const handleRowsPerPageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    onRowsPerPageChange?.(newRowsPerPage);

    // Announce change to screen readers
    const message = `Showing ${newRowsPerPage} rows per page`;
    const announcer = document.getElementById('table-live-region');
    if (announcer) announcer.textContent = message;
  }, [onRowsPerPageChange]);

  // Format cell content with error handling
  const formatCellContent = useCallback((value: any, format?: (value: any) => React.ReactNode) => {
    try {
      if (value == null) return '-';
      if (format) return format(value);
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    } catch (error) {
      console.error('Error formatting cell content:', error);
      return 'Error';
    }
  }, []);

  // Keyboard navigation setup
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('table')) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          (target.closest('tr')?.nextElementSibling?.querySelector('td') as HTMLElement)?.focus();
          break;
        case 'ArrowUp':
          event.preventDefault();
          (target.closest('tr')?.previousElementSibling?.querySelector('td') as HTMLElement)?.focus();
          break;
        case 'Home':
          event.preventDefault();
          (target.closest('tbody')?.firstElementChild?.querySelector('td') as HTMLElement)?.focus();
          break;
        case 'End':
          event.preventDefault();
          (target.closest('tbody')?.lastElementChild?.querySelector('td') as HTMLElement)?.focus();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Render loading state
  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 2 }}>
        <Loading ariaLabel="Loading table data" />
      </Paper>
    );
  }

  return (
    <>
      {/* Live region for accessibility announcements */}
      <div id="table-live-region" role="status" aria-live="polite" className="sr-only" />

      <Paper elevation={0}>
        <TableContainer>
          <Table
            role="grid"
            aria-label={ariaLabel}
            aria-rowcount={data.length}
            stickyHeader={stickyHeader}
          >
            <TableHead>
              <TableRow>
                {visibleColumns.map(column => (
                  <TableCell
                    key={column.id}
                    align={column.align || 'left'}
                    style={column.headerStyle}
                    sortDirection={sortBy === column.id ? sortDir : false}
                  >
                    {column.sortable ? (
                      <TableSortLabel
                        active={sortBy === column.id}
                        direction={sortBy === column.id ? sortDir : 'asc'}
                        onClick={() => handleSort(column.id)}
                        aria-label={SORT_ARIA_LABEL.replace('{column}', column.label)}
                      >
                        {column.label}
                      </TableSortLabel>
                    ) : (
                      column.label
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((row, index) => (
                  <TableRow
                    key={index}
                    hover={!!onRowClick}
                    onClick={() => onRowClick?.(row)}
                    tabIndex={0}
                    role="row"
                    aria-rowindex={page * rowsPerPage + index + 1}
                    aria-label={ROW_ARIA_LABEL}
                    sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {visibleColumns.map(column => (
                      <TableCell
                        key={column.id}
                        align={column.align || 'left'}
                        style={
                          typeof column.cellStyle === 'function'
                            ? column.cellStyle(row[column.id])
                            : column.cellStyle
                        }
                        tabIndex={-1}
                      >
                        {formatCellContent(row[column.id], column.format)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        {pagination && (
          <TablePagination
            component="div"
            count={data.length}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={rowsPerPageOptions}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            aria-label="Table pagination"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} of ${count}`
            }
          />
        )}
      </Paper>
    </>
  );
});

// Display name for debugging
CustomTable.displayName = 'CustomTable';

export default CustomTable;