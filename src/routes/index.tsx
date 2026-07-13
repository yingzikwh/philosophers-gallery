import { useState, useMemo, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, Sparkles, GraduationCap, Search, Heart, GitBranch, Clock, Menu, X, Swords } from 'lucide-react';
import { philosophers } from '@/data/philosophers';
import { EnhancedPhilosopherCard } from '@/components/EnhancedPhilosopherCard';
import { FilterBar } from '@/components/FilterBar';
import { ComparisonPanel } from '@/components/ComparisonPanel';
import { ParticleBackground } from '@/components/ParticleBackground';
import { InfluenceGraph } from '@/components/InfluenceGraph';
import { Timeline } from '@/components/Timeline';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TypewriterText } from '@/components/TypewriterText';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const [selectedEra, setSelectedEra] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isInfluenceGraphOpen, setIsInfluenceGraphOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('philosopher-favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch {
        // ignore parse error
      }
    }
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('philosopher-favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Close comparison panel automatically when no philosophers are selected
  useEffect(() => {
    if (selectedIds.length === 0) {
      setIsComparisonOpen(false);
    }
  }, [selectedIds]);

  // Filter philosophers based on selected criteria and search
  const filteredPhilosophers = useMemo(() => {
    let result = philosophers.filter((p) => {
      const eraMatch = selectedEra === 'all' || p.era === selectedEra;
      const schoolMatch = selectedSchool === 'all' || p.school.includes(selectedSchool);
      const themeMatch = selectedTheme === 'all' || p.themes.includes(selectedTheme);
      const favoriteMatch = !showFavoritesOnly || favorites.includes(p.id);
      
      const searchMatch = searchQuery === '' || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.school.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.themes.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.coreIdeas.some(i => i.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return eraMatch && schoolMatch && themeMatch && favoriteMatch && searchMatch;
    });
    return result;
  }, [selectedEra, selectedSchool, selectedTheme, searchQuery, favorites, showFavoritesOnly]);

  // Handle philosopher selection for comparison
  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((pid) => pid !== id);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, id];
    });
  };

  // Handle favorite toggle
  const handleFavorite = (id: string) => {
    setFavorites((prev) => {
      if (prev.includes(id)) {
        return prev.filter((fid) => fid !== id);
      }
      return [...prev, id];
    });
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSelectedEra('all');
    setSelectedSchool('all');
    setSelectedTheme('all');
    setSearchQuery('');
    setShowFavoritesOnly(false);
  };

  // Remove from comparison
  const handleRemoveFromComparison = (id: string) => {
    setSelectedIds((prev) => prev.filter((pid) => pid !== id));
  };

  // Clear all comparisons
  const handleClearComparison = () => {
    setSelectedIds([]);
  };

  return (
    <div className={cn(
      'min-h-screen bg-background transition-[padding] duration-300 ease-out',
      isComparisonOpen ? 'lg:pr-[42rem] xl:pr-[44rem]' : ''
    )}>
      {/* Particle Background */}
      <ParticleBackground />

      {/* Header - pinned at top */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl lg:text-2xl font-semibold text-foreground gradient-text-gold">
                  哲思殿堂
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  探索人类思想的璀璨星河
                </p>
              </div>
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索思想家、流派、主题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9 pr-4 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              {/* Favorites Toggle */}
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                  showFavoritesOnly
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <Heart className={cn('w-4 h-4', showFavoritesOnly && 'fill-current')} />
                <span className="hidden xl:inline">收藏</span>
                {favorites.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                    {favorites.length}
                  </span>
                )}
              </button>

              {/* Influence Graph */}
              <button
                onClick={() => setIsInfluenceGraphOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
              >
                <GitBranch className="w-4 h-4" />
                <span className="hidden xl:inline">脉络</span>
              </button>

              {/* Timeline */}
              <button
                onClick={() => setIsTimelineOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
              >
                <Clock className="w-4 h-4" />
                <span className="hidden xl:inline">时间轴</span>
              </button>

              {/* Campaign */}
              <Link
                to="/campaign"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
              >
                <Swords className="w-4 h-4" />
                <span className="hidden xl:inline">闯关</span>
              </Link>

              {/* Stats */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">{filteredPhilosophers.length}</span> / {philosophers.length}
                </span>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-border/50 bg-background/95 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
              {/* Mobile Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索思想家..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Mobile Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm flex-1 justify-center',
                    showFavoritesOnly
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  <Heart className={cn('w-4 h-4', showFavoritesOnly && 'fill-current')} />
                  收藏 ({favorites.length})
                </button>
                <button
                  onClick={() => setIsInfluenceGraphOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground flex-1 justify-center"
                >
                  <GitBranch className="w-4 h-4" />
                  脉络
                </button>
                <button
                  onClick={() => setIsTimelineOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground flex-1 justify-center"
                >
                  <Clock className="w-4 h-4" />
                  时间轴
                </button>
                <Link
                  to="/campaign"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/50 text-muted-foreground flex-1 justify-center"
                >
                  <Swords className="w-4 h-4" />
                  闯关
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <FilterBar
          selectedEra={selectedEra}
          selectedSchool={selectedSchool}
          selectedTheme={selectedTheme}
          onEraChange={setSelectedEra}
          onSchoolChange={setSelectedSchool}
          onThemeChange={setSelectedTheme}
          onClearFilters={handleClearFilters}
          resultCount={filteredPhilosophers.length}
        />
      </header>

      {/* Main Content */}
      <main className={cn(
        'max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-8 relative z-10 transition-all'
      )}>
        {/* Introduction with Typewriter */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">智慧之光</span>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto font-body text-sm lg:text-base leading-relaxed">
            <TypewriterText
              text="从古希腊的苏格拉底到现代的加缪，这些伟大的思想家用他们的智慧照亮了人类文明的进程。点击卡片右上角的选择按钮，最多可选择4位思想家进行对比分析。"
              speed={30}
              delay={500}
            />
          </p>
        </div>

        {/* Philosopher Cards Grid */}
        {filteredPhilosophers.length > 0 ? (
          <div
            className={cn(
              'grid gap-4 lg:gap-6',
              selectedIds.length > 0
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            )}
          >
            {filteredPhilosophers.map((philosopher, index) => (
              <EnhancedPhilosopherCard
                key={philosopher.id}
                philosopher={philosopher}
                isSelected={selectedIds.includes(philosopher.id)}
                isFavorited={favorites.includes(philosopher.id)}
                onSelect={handleSelect}
                onFavorite={handleFavorite}
                onChat={() => {}}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg text-foreground mb-2">未找到匹配的思想家</h3>
            <p className="text-sm text-muted-foreground mb-4">
              请尝试调整筛选条件或搜索关键词
            </p>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              清除筛选
            </button>
          </div>
        )}
      </main>

      {/* Comparison Panel */}
      <ComparisonPanel
        selectedIds={selectedIds}
        philosophers={philosophers}
        onRemove={handleRemoveFromComparison}
        onClear={handleClearComparison}
        open={isComparisonOpen}
        onOpenChange={setIsComparisonOpen}
      />

      {/* Influence Graph */}
      <ErrorBoundary>
        <InfluenceGraph
          isOpen={isInfluenceGraphOpen}
          onOpenChange={setIsInfluenceGraphOpen}
        />
      </ErrorBoundary>

      {/* Timeline */}
      <ErrorBoundary>
        <Timeline
          isOpen={isTimelineOpen}
          onOpenChange={setIsTimelineOpen}
        />
      </ErrorBoundary>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 mt-12 relative z-10">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 text-center">
          <p className="text-xs text-muted-foreground">
            哲思殿堂 · 探索人类思想的璀璨星河
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            共收录 {philosophers.length} 位伟大思想家
          </p>
        </div>
      </footer>
    </div>
  );
}
