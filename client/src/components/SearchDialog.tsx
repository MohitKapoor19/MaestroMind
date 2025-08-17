import { useState, useRef, useEffect } from 'react';
import { Search, Filter, X, Loader2, FileText, Users, Activity, Bookmark } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useSearch, type SearchResult } from '@/hooks/useSearch';

interface SearchDialogProps {
  onNavigate?: (type: string, id: string) => void;
  onTabChange?: (tab: string) => void;
}

export default function SearchDialog({ onNavigate, onTabChange }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    query,
    filters,
    results,
    isLoading,
    search,
    updateFilters,
    clearSearch,
    selectResult,
  } = useSearch();

  // Keyboard shortcut handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
      
      if (e.key === 'Escape') {
        setIsOpen(false);
        clearSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSearch]);

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'task':
        return <FileText className="h-4 w-4" />;
      case 'agent':
        return <Users className="h-4 w-4" />;
      case 'log':
        return <Activity className="h-4 w-4" />;
      case 'template':
        return <Bookmark className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getResultTypeColor = (type: string) => {
    switch (type) {
      case 'task':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'agent':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'log':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'template':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    selectResult(result);

    // Handle navigation based on result type and ID
    if (result.id.startsWith('quick-')) {
      // Handle quick search suggestions
      switch (result.id) {
        case 'quick-failed-tasks':
          onTabChange?.('logs');
          break;
        case 'quick-active-tasks':
          onTabChange?.('network');
          break;
        case 'quick-all-agents':
          onTabChange?.('network');
          break;
        case 'quick-budget':
          onTabChange?.('budget');
          break;
      }
    } else {
      // Handle regular search results
      switch (result.type) {
        case 'task':
          onTabChange?.('output');
          onNavigate?.('task', result.id);
          break;
        case 'agent':
          onTabChange?.('inspector');
          onNavigate?.('agent', result.id);
          break;
        case 'log':
          onTabChange?.('logs');
          break;
        case 'template':
          onTabChange?.('templates');
          break;
      }
    }

    setIsOpen(false);
  };

  const handleInputChange = (value: string) => {
    search(value);
    setIsOpen(value.trim().length >= 2);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tasks, agents, logs... (Ctrl+K)"
            className="w-80 pl-10 pr-20"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsOpen(query.trim().length >= 2)}
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
            {query && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSearch();
                  setIsOpen(false);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setShowFilters(!showFilters);
              }}
            >
              <Filter className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverTrigger>
      
      <PopoverContent
        className="w-[400px] p-0"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList className="max-h-[300px]">
            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            )}

            {!isLoading && results.length === 0 && query.trim().length >= 2 && (
              <CommandEmpty>
                <div className="py-6 text-center text-sm">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p>No results found for "{query}"</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Try searching for tasks, agents, or logs
                  </p>
                </div>
              </CommandEmpty>
            )}

            {!isLoading && results.length > 0 && (
              <CommandGroup heading="Search Results">
                {results.map((result) => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleResultSelect(result)}
                    className="flex items-center gap-3 p-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {getResultIcon(result.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.title}</span>
                          <Badge
                            variant="secondary"
                            className={cn("text-xs", getResultTypeColor(result.type))}
                          >
                            {result.type}
                          </Badge>
                        </div>
                        {result.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {result.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(result.relevance * 100)}%
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {query.trim().length < 2 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Search className="mx-auto h-8 w-8 mb-2" />
                <p>Type to search tasks, agents, logs, and templates</p>
                <div className="mt-4 text-xs">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">Ctrl</kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">K</kbd>
                    <span>to open search</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">Esc</kbd>
                    <span>to close</span>
                  </div>
                </div>
              </div>
            )}
          </CommandList>
        </Command>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="m-2 p-3 border-t">
            <div className="text-sm font-medium mb-2">Filters</div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Content Type</label>
                <div className="flex gap-1 mt-1">
                  {['task', 'agent', 'log', 'template'].map((type) => (
                    <Button
                      key={type}
                      variant={filters.types?.includes(type as any) ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const currentTypes = filters.types || [];
                        const newTypes = currentTypes.includes(type as any)
                          ? currentTypes.filter(t => t !== type)
                          : [...currentTypes, type as any];
                        updateFilters({ types: newTypes });
                      }}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </PopoverContent>
    </Popover>
  );
}