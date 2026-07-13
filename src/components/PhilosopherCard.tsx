import { useState } from 'react';
import { BookOpen, Quote, Lightbulb, Globe, Calendar, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Philosopher } from '@/data/philosophers';

interface PhilosopherCardProps {
  philosopher: Philosopher;
  isSelected: boolean;
  onSelect: (id: string) => void;
  index: number;
}

export function PhilosopherCard({ philosopher, isSelected, onSelect, index }: PhilosopherCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuote, setShowQuote] = useState(false);

  const formatYear = (year: number) => {
    if (year < 0) {
      return `公元前${Math.abs(year)}年`;
    }
    return `${year}年`;
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg overflow-hidden card-hover animate-fade-in',
        'bg-card/80 backdrop-blur-sm border border-border/50',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Selection Checkbox */}
      <button
        onClick={() => onSelect(philosopher.id)}
        className={cn(
          'absolute top-3 right-3 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center',
          'transition-all duration-200',
          isSelected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-background/80 border-muted-foreground/30 text-transparent hover:border-primary/50'
        )}
      >
        <Check className="w-3.5 h-3.5" />
      </button>

      {/* Card Header with Portrait */}
      <div className="relative h-48 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
        <img
          src={philosopher.portrait}
          alt={philosopher.name}
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-card via-card/90 to-transparent">
          <h3 className="font-display text-xl font-semibold text-foreground">
            {philosopher.name}
          </h3>
          <p className="text-sm text-muted-foreground font-body">
            {philosopher.nameEn}
          </p>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-4">
        {/* Basic Info */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatYear(philosopher.birthYear)} - {formatYear(philosopher.deathYear)}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {philosopher.nationality}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {philosopher.school.slice(0, 2).map((school) => (
            <span
              key={school}
              className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground"
            >
              {school}
            </span>
          ))}
        </div>

        {/* Core Ideas Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span>核心观点</span>
          </div>
          <ul className="space-y-1.5">
            {philosopher.coreIdeas.slice(0, isExpanded ? undefined : 2).map((idea, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground leading-relaxed pl-2 border-l border-primary/30"
              >
                {idea}
              </li>
            ))}
          </ul>
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              收起详情
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              展开详情
            </>
          )}
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t border-border/50 animate-fade-in">
            {/* Representative Works */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BookOpen className="w-4 h-4 text-primary" />
                <span>代表著作</span>
              </div>
              <ul className="space-y-1">
                {philosopher.works.map((work, i) => (
                  <li key={i} className="text-xs text-muted-foreground pl-2">
                    {work}
                  </li>
                ))}
              </ul>
            </div>

            {/* Classic Quotes */}
            <div className="space-y-2">
              <button
                onClick={() => setShowQuote(!showQuote)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                <Quote className="w-4 h-4 text-primary" />
                <span>经典语录</span>
              </button>
              {showQuote && (
                <div className="relative p-3 bg-muted/50 rounded-lg animate-fade-in">
                  <span className="quote-mark absolute -top-2 left-2">"</span>
                  <p className="text-sm text-foreground italic font-body pl-4">
                    {philosopher.quotes[0]}
                  </p>
                </div>
              )}
            </div>

            {/* Influence */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span>思想影响力</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {philosopher.influence}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
