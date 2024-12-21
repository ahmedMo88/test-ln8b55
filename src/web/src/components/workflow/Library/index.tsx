/**
 * @fileoverview A searchable, accessible library component for workflow nodes with enhanced
 * drag-and-drop capabilities, real-time validation, and Material Design 3.0 styling.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { styled } from '@mui/material/styles';
import { 
  List, 
  ListItem, 
  ListItemText, 
  Collapse, 
  CircularProgress,
  Typography,
  IconButton,
  InputAdornment,
  Tooltip,
  Badge
} from '@mui/material';
import { 
  DragIndicator, 
  ExpandMore, 
  Search,
  Error as ErrorIcon 
} from '@mui/icons-material';
import debounce from 'lodash/debounce';

// Internal imports
import { NodeType } from '../../../types/node.types';
import Card from '../../common/Card';
import Input from '../../common/Input';

// Node categories with enhanced accessibility labels
const NODE_CATEGORIES = {
  triggers: {
    label: 'Triggers',
    description: 'Start your workflow with these trigger events',
    icon: '⚡',
    nodes: ['email_trigger', 'schedule_trigger', 'webhook_trigger']
  },
  actions: {
    label: 'Actions',
    description: 'Add actions to process and transform data',
    icon: '⚙️',
    nodes: ['send_email', 'update_record', 'api_call']
  },
  conditions: {
    label: 'Conditions',
    description: 'Add logic and branching to your workflow',
    icon: '🔀',
    nodes: ['if_condition', 'switch_condition', 'loop_condition']
  },
  ai_tasks: {
    label: 'AI Tasks',
    description: 'Leverage AI capabilities in your workflow',
    icon: '🤖',
    nodes: ['text_analysis', 'image_recognition', 'sentiment_analysis']
  }
} as const;

// Styled components following Material Design 3.0
const LibraryContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  width: '280px',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRight: `1px solid ${theme.palette.divider}`,
  overflow: 'hidden',
}));

const SearchContainer = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const CategoryList = styled(List)(({ theme }) => ({
  overflowY: 'auto',
  flex: 1,
  padding: 0,
  '& .MuiListItem-root': {
    padding: theme.spacing(1, 2),
  },
}));

const CategoryHeader = styled(ListItem)<{ expanded: boolean }>(({ theme, expanded }) => ({
  cursor: 'pointer',
  backgroundColor: theme.palette.background.default,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '& .MuiListItemText-primary': {
    fontWeight: 500,
  },
  '& .expandIcon': {
    transform: expanded ? 'rotate(180deg)' : 'none',
    transition: theme.transitions.create('transform'),
  },
}));

const NodeItem = styled(ListItem)<{ isDragging?: boolean }>(({ theme, isDragging }) => ({
  cursor: 'grab',
  userSelect: 'none',
  opacity: isDragging ? 0.5 : 1,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&:active': {
    cursor: 'grabbing',
  },
}));

// Props interface
interface LibraryProps {
  onNodeDrag: (type: NodeType, event: React.DragEvent, isValid: boolean) => void;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
}

// Custom hook for debounced search
const useDebounceSearch = (callback: (value: string) => void, delay: number) => {
  const debouncedFn = useMemo(
    () => debounce(callback, delay),
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      debouncedFn.cancel();
    };
  }, [debouncedFn]);

  return debouncedFn;
};

/**
 * Library component providing a searchable, accessible interface for workflow nodes
 * with enhanced drag-and-drop capabilities and Material Design 3.0 styling.
 */
export const Library: React.FC<LibraryProps> = React.memo(({
  onNodeDrag,
  onSearch,
  isLoading = false,
}) => {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => 
    Object.keys(NODE_CATEGORIES).reduce((acc, key) => ({ ...acc, [key]: true }), {})
  );
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // Debounced search handler
  const debouncedSearch = useDebounceSearch((value: string) => {
    onSearch?.(value);
  }, 300);

  // Handle search input changes
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
  }, [debouncedSearch]);

  // Toggle category expansion
  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  }, []);

  // Handle node drag start
  const handleNodeDragStart = useCallback((
    nodeType: NodeType,
    event: React.DragEvent
  ) => {
    event.dataTransfer.setData('application/json', JSON.stringify({ type: nodeType }));
    event.dataTransfer.effectAllowed = 'move';
    setDraggedNode(nodeType);
    onNodeDrag(nodeType, event, true);
  }, [onNodeDrag]);

  // Handle node drag end
  const handleNodeDragEnd = useCallback(() => {
    setDraggedNode(null);
  }, []);

  return (
    <LibraryContainer role="complementary" aria-label="Workflow Node Library">
      <SearchContainer>
        <Input
          name="nodeSearch"
          label="Search nodes"
          value={searchQuery}
          onChange={handleSearchChange}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          aria-label="Search workflow nodes"
        />
      </SearchContainer>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <CircularProgress />
        </div>
      ) : (
        <CategoryList>
          {Object.entries(NODE_CATEGORIES).map(([category, { label, description, icon, nodes }]) => (
            <React.Fragment key={category}>
              <CategoryHeader
                expanded={expandedCategories[category]}
                onClick={() => toggleCategory(category)}
                aria-expanded={expandedCategories[category]}
                aria-controls={`category-${category}-content`}
              >
                <Typography variant="body1" component="span" sx={{ mr: 1 }}>
                  {icon}
                </Typography>
                <ListItemText 
                  primary={label}
                  secondary={description}
                  primaryTypographyProps={{ variant: 'subtitle1' }}
                  secondaryTypographyProps={{ variant: 'body2' }}
                />
                <IconButton
                  className="expandIcon"
                  size="small"
                  edge="end"
                  aria-label={expandedCategories[category] ? 'Collapse' : 'Expand'}
                >
                  <ExpandMore />
                </IconButton>
              </CategoryHeader>

              <Collapse
                in={expandedCategories[category]}
                timeout="auto"
                id={`category-${category}-content`}
              >
                <List component="div" disablePadding>
                  {nodes.map((nodeType) => (
                    <NodeItem
                      key={nodeType}
                      isDragging={draggedNode === nodeType}
                      draggable
                      onDragStart={(e) => handleNodeDragStart(nodeType as NodeType, e)}
                      onDragEnd={handleNodeDragEnd}
                      aria-label={`Drag ${nodeType} node`}
                    >
                      <DragIndicator sx={{ mr: 2, color: 'action.active' }} />
                      <ListItemText
                        primary={nodeType.split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      />
                    </NodeItem>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          ))}
        </CategoryList>
      )}
    </LibraryContainer>
  );
});

// Display name for debugging
Library.displayName = 'Library';

export default Library;