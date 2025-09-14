import { Search, User, Menu, BookOpen, LogOut, Shield } from "lucide-react";
import type { ViewMode } from "../App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useUser } from "../contexts/UserContext";

interface NavigationProps {
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  user?: any;
  onLoginClick?: () => void;
  setCurrentView?: (view: ViewMode) => void;
}

export function Navigation({ onSearchChange, searchValue, onLoginClick, setCurrentView }: NavigationProps) {
  const { user, logout, isAdmin } = useUser();
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <span className="text-xl font-semibold text-foreground">SomaRec</span>
          </div>

          {/* Search Bar - Hidden on mobile, shown on larger screens */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by title, author, keyword, or theme..."
                className="pl-10 bg-input-background border-border"
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
              />
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden lg:flex items-center space-x-6">
            <Button variant="ghost" className="text-foreground hover:text-primary" onClick={() => setCurrentView?.("search")}>Browse Themes</Button>
            <Button variant="ghost" className="text-foreground hover:text-primary" onClick={() => setCurrentView?.("cbc")}>CBC Alignment</Button>
            <Button variant="ghost" className="text-foreground hover:text-primary" onClick={() => setCurrentView?.("profile")}>My Library</Button>
            {isAdmin && (
              <Button variant="ghost" className="text-foreground hover:text-primary" onClick={() => setCurrentView?.("admin")}>Admin Dashboard</Button>
            )}
          </div>

          {/* User Actions */}
          <div className="flex items-center space-x-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-foreground hover:text-primary flex items-center gap-2">
                    <User className="h-5 w-5" />
                    <span className="hidden sm:inline">{user.name}</span>
                    {isAdmin && (
                      <Badge variant="secondary" className="hidden sm:flex">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="outline" 
                onClick={onLoginClick}
                className="text-foreground hover:text-primary"
              >
                <User className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden text-foreground hover:text-primary">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="md:hidden pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search books, authors, themes..."
              className="pl-10 bg-input-background border-border"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        </div>
      </div>
  </nav>
  );
}