import { Card, CardHeader, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Filter, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";
import { supabase } from "../utils/supabase/client";

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

const availableFilters = {
  languages: ["English", "Kiswahili", "Kikuyu", "Luo", "Kalenjin"],
  genres: ["Fiction", "Poetry", "Drama", "Non-fiction", "Biography", "Humor", "Essays"],
};

export function FilterSidebar({ selectedFilters, onFilterChange, onClearFilters }: FilterSidebarProps) {
  const [themes, setThemes] = useState<string[]>([]);
  const [curriculumTags, setCurriculumTags] = useState<string[]>([]);
  useEffect(() => {
    const fetchFilters = async () => {
      const { data: themeData } = await supabase.from("themes").select("name");
      setThemes(themeData?.map((t: any) => t.name) || []);
      const { data: curriculumData } = await supabase.from("curriculum_tags").select("name");
      setCurriculumTags(curriculumData?.map((c: any) => c.name) || []);
    };
    fetchFilters();
  }, []);
  const [openSections, setOpenSections] = useState({
    themes: true,
    languages: true,
    genres: true,
    cbcLevels: true
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
            {themes.map((theme) => (
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
            ))}
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
            {availableFilters.languages.map((language) => (
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
            ))}
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
            {availableFilters.genres.map((genre) => (
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
            ))}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Curriculum Tags Filter (dynamic) */}
        <Collapsible open={openSections.cbcLevels} onOpenChange={() => toggleSection('cbcLevels')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <span className="font-medium">Curriculum Tags</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${openSections.cbcLevels ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-3">
            {curriculumTags.map((tag) => (
              <div key={tag} className="flex items-center space-x-2">
                <Checkbox
                  id={`cbc-${tag}`}
                  checked={selectedFilters.cbcLevels.includes(tag)}
                  onCheckedChange={() => handleFilterToggle('cbcLevels', tag)}
                />
                <label
                  htmlFor={`cbc-${tag}`}
                  className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {tag}
                </label>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}