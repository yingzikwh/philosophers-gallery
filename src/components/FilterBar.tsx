import { useState, useEffect } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterOptions } from '@/data/philosophers';

interface FilterBarProps {
  selectedEra: string;
  selectedSchool: string;
  selectedTheme: string;
  onEraChange: (value: string) => void;
  onSchoolChange: (value: string) => void;
  onThemeChange: (value: string) => void;
  onClearFilters: () => void;
  resultCount: number;
}

export function FilterBar({
  selectedEra,
  selectedSchool,
  selectedTheme,
  onEraChange,
  onSchoolChange,
  onThemeChange,
  onClearFilters,
  resultCount,
}: FilterBarProps) {
  const hasActiveFilters = selectedEra !== 'all' || selectedSchool !== 'all' || selectedTheme !== 'all';
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand when filters are active
  useEffect(() => {
    if (hasActiveFilters) {
      setIsExpanded(true);
    }
  }, [hasActiveFilters]);

  const activeFilterCount =
    (selectedEra !== 'all' ? 1 : 0) +
    (selectedSchool !== 'all' ? 1 : 0) +
    (selectedTheme !== 'all' ? 1 : 0);

  return (
    <div className="w-full bg-card/60 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Compact bar - always visible */}
        <div className="flex items-center justify-between py-2.5">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              hasActiveFilters
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Filter className="w-4 h-4" />
            <span>筛选思想家</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              共 <span className="text-primary font-medium">{resultCount}</span> 位思想家
            </span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  onClearFilters();
                  setIsExpanded(false);
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <X className="w-3 h-3" />
                清除筛选
              </button>
            )}
          </div>
        </div>

        {/* Expandable filter panel */}
        {isExpanded && (
          <div className="pb-4 pt-1 space-y-4 animate-fade-in">
            {/* Era Filter */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground font-medium">时代</span>
              <div className="flex flex-wrap gap-2">
                {filterOptions.era.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onEraChange(option.value)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-all duration-200',
                      selectedEra === option.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/50 text-secondary-foreground border-border/50 hover:border-primary/50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* School Filter */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground font-medium">哲学流派</span>
              <div className="flex flex-wrap gap-2">
                {filterOptions.school.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onSchoolChange(option.value)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-all duration-200',
                      selectedSchool === option.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/50 text-secondary-foreground border-border/50 hover:border-primary/50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Filter */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground font-medium">主题</span>
              <div className="flex flex-wrap gap-2">
                {filterOptions.theme.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onThemeChange(option.value)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-all duration-200',
                      selectedTheme === option.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/50 text-secondary-foreground border-border/50 hover:border-primary/50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
