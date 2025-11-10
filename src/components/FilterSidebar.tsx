import { Card, CardHeader, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Filter, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";

interface FilterSidebarProps {
  selectedFilters: {
    themes: string[];
    languages: string[];
    genres: string[];
    cbcLevels: string[];
  };
  onFilterChange: (filters: any) => void;
  onClearFilters: () => void;
}

// Filters will be loaded from backend

export function FilterSidebar({ selectedFilters, onFilterChange, onClearFilters }: FilterSidebarProps) {
  const [themes, setThemes] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        setLoading(true);
        
        // Helper function to fetch with timeout
        const fetchWithTimeout = (url: string, timeout = 5000) => {
          return Promise.race([
            fetch(url),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error('Request timeout')), timeout)
            ),
          ]);
        };

        // Try Supabase for themes first
        const { supabase } = await import('../utils/supabase/client');
        
        // Fetch themes from Supabase (with timeout handling)
        let themesResult;
        try {
          themesResult = await Promise.race([
            supabase.from('themes').select('name').order('name'),
            new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error('Themes query timeout')), 5000)
            ),
          ]);
        } catch (themeError) {
          console.warn('Themes query failed or timed out:', themeError);
          themesResult = { error: themeError, data: null };
        }
        
        // Set themes from Supabase
        if (!themesResult.error && themesResult.data && themesResult.data.length > 0) {
          const themeNames = themesResult.data.map((t: any) => {
            // Handle different possible column names
            return t.name || t.theme || t.title || t.value || '';
          }).filter(Boolean);
          setThemes(themeNames);
        } else {
          // Log error for debugging
          if (themesResult.error) {
            console.log('Themes table error (using backend API fallback):', themesResult.error);
          }
          // Fallback to backend API for themes
          try {
            const themesRes = await fetchWithTimeout(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/themes`, 3000);
            if (themesRes.ok) {
              const themesJson = await themesRes.json();
              setThemes(Array.isArray(themesJson) ? themesJson : []);
            } else {
              setThemes([]);
            }
          } catch (fallbackError) {
            console.warn('Backend API fallback also failed:', fallbackError);
            setThemes([]);
          }
        }
        
        // Languages and genres from backend API (with timeout and error handling)
        try {
          const [languagesRes, genresRes] = await Promise.allSettled([
            fetchWithTimeout(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/languages`, 3000),
            fetchWithTimeout(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/genres`, 3000),
          ]);
          
          // Handle languages
          if (languagesRes.status === 'fulfilled' && languagesRes.value.ok) {
            try {
              const languagesJson = await languagesRes.value.json();
              setLanguages(Array.isArray(languagesJson) ? languagesJson : []);
            } catch (e) {
              console.warn('Error parsing languages JSON:', e);
              setLanguages([]);
            }
          } else {
            console.warn('Languages API failed:', languagesRes.status === 'rejected' ? languagesRes.reason : 'Request failed');
            setLanguages([]);
          }
          
          // Handle genres
          if (genresRes.status === 'fulfilled' && genresRes.value.ok) {
            try {
              const genresJson = await genresRes.value.json();
              setGenres(Array.isArray(genresJson) ? genresJson : []);
            } catch (e) {
              console.warn('Error parsing genres JSON:', e);
              setGenres([]);
            }
          } else {
            console.warn('Genres API failed:', genresRes.status === 'rejected' ? genresRes.reason : 'Request failed');
            setGenres([]);
          }
        } catch (apiError) {
          console.warn('Error fetching languages/genres:', apiError);
          setLanguages([]);
          setGenres([]);
        }
      } catch (err) {
        console.error('Error loading filters:', err);
        setThemes([]);
        setLanguages([]);
        setGenres([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFilters();
  }, []);
  const [openSections, setOpenSections] = useState({
  themes: true,
  languages: true,
  genres: true
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleFilterToggle = (category: keyof typeof selectedFilters, value: string) => {
    const currentValues = selectedFilters[category];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    onFilterChange({
      ...selectedFilters,
      [category]: newValues
    });
  };

  const totalFilters = Object.values(selectedFilters).flat().length;

  return (
    <Card className="h-fit sticky top-20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <h3>Filters</h3>
          </div>
          {totalFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        {totalFilters > 0 && (
          <Badge variant="secondary" className="w-fit">
            {totalFilters} filter{totalFilters !== 1 ? 's' : ''} applied
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Themes Filter (dynamic) */}
        <Collapsible open={openSections.themes} onOpenChange={() => toggleSection('themes')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Themes</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${openSections.themes ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading themes...</div>
            ) : themes.length > 0 ? (
              themes.map((theme) => (
              <div key={theme} className="flex items-center space-x-2">
                <Checkbox
                  id={`theme-${theme}`}
                  checked={selectedFilters.themes.includes(theme)}
                  onCheckedChange={() => handleFilterToggle('themes', theme)}
                />
                <label
                  htmlFor={`theme-${theme}`}
                  className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {theme}
                </label>
              </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                No themes available. Use semantic search to discover books by topic!
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Languages Filter */}
        <Collapsible open={openSections.languages} onOpenChange={() => toggleSection('languages')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Language</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${openSections.languages ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading languages...</div>
            ) : languages.length > 0 ? (
              languages.map((language) => (
              <div key={language} className="flex items-center space-x-2">
                <Checkbox
                  id={`language-${language}`}
                  checked={selectedFilters.languages.includes(language)}
                  onCheckedChange={() => handleFilterToggle('languages', language)}
                />
                <label
                  htmlFor={`language-${language}`}
                  className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {language}
                </label>
              </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No languages available</div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Genres Filter */}
        <Collapsible open={openSections.genres} onOpenChange={() => toggleSection('genres')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Genre</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${openSections.genres ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading genres...</div>
            ) : genres.length > 0 ? (
              genres.map((genre) => (
              <div key={genre} className="flex items-center space-x-2">
                <Checkbox
                  id={`genre-${genre}`}
                  checked={selectedFilters.genres.includes(genre)}
                  onCheckedChange={() => handleFilterToggle('genres', genre)}
                />
                <label
                  htmlFor={`genre-${genre}`}
                  className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {genre}
                </label>
              </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No genres available</div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* CBC/curriculum filter removed: not present in backend or data */}
      </CardContent>
    </Card>
  );
}