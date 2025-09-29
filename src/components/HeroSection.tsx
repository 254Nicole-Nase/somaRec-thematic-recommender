import { Search, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface HeroSectionProps {
  onThemeSelect?: (theme: string) => void;
  onSearchChange?: (value: string) => void;
}

const featuredThemes = [
  "Postcolonial Identity",
  "Environmental Stewardship", 
  "Ubuntu Philosophy",
  "Gender & Society",
  "Cultural Heritage",
  "Education & Growth",
  "Economic Development",
  "Social Justice"
];

export function HeroSection({ onThemeSelect, onSearchChange }: HeroSectionProps) {
  return (
    <section className="relative py-16 lg:py-24 bg-gradient-to-br from-background to-muted">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <ImageWithFallback
          src="https://images.unsplash.com/flagged/photo-1559155359-ad9116adc821?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxrZW55YW4lMjB0cmFkaXRpb25hbCUyMHBhdHRlcm5zfGVufDF8fHx8MTc1NjY1MzU0Nnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
          alt="African traditional patterns"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Title */}
          <div className="flex items-center justify-center mb-6">
            <Sparkles className="h-8 w-8 text-primary mr-3" />
            <h1 className="text-3xl lg:text-5xl">
              Discover Kenyan Literature
            </h1>
          </div>
          
          <p className="text-lg lg:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Explore themes, discover connections, and find the perfect books for your educational journey through Kenya's rich literary landscape.
          </p>

          {/* Main Search Bar */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by title, author, keyword, or theme..."
                className="pl-12 pr-4 h-14 bg-card border-2 border-border focus:border-primary shadow-lg"
                onChange={(e) => onSearchChange?.(e.target.value)}
              />
              <Button className="absolute right-2 top-2 h-10 px-6 bg-primary hover:bg-primary/90">
                Search
              </Button>
            </div>
          </div>

          {/* Quick Theme Selection */}
          <div className="space-y-4">
            <h3 className="text-lg text-muted-foreground">
              Quick-pick themes:
            </h3>
            <div className="flex flex-wrap justify-center gap-2 lg:gap-3">
              {featuredThemes.map((theme) => (
                <Badge
                  key={theme}
                  variant="outline"
                  className="px-4 py-2 cursor-pointer border-2 border-primary/20 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 text-sm lg:text-base"
                  onClick={() => onThemeSelect?.(theme)}
                >
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}