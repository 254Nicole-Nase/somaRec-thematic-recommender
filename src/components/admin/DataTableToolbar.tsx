import * as React from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Search, Filter, Download, MoreVertical, X } from "lucide-react";
import { Badge } from "../ui/badge";

export interface DataTableToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterOption[];
  selectedFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onClearFilters?: () => void;
  bulkActions?: BulkAction[];
  selectedCount?: number;
  onExport?: () => void;
  actions?: React.ReactNode;
}

export interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  selectedFilters = {},
  onFilterChange,
  onClearFilters,
  bulkActions = [],
  selectedCount = 0,
  onExport,
  actions,
}: DataTableToolbarProps) {
  const hasActiveFilters = Object.values(selectedFilters).some((v) => v);
  const hasActiveSearch = searchValue && searchValue.length > 0;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-1 items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue || ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-8"
          />
          {hasActiveSearch && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0"
              onClick={() => onSearchChange?.("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Filters */}
        {filters.map((filter) => {
          const currentValue = selectedFilters[filter.key];
          // Use "all" as the value when no filter is selected, otherwise use the actual value
          const selectValue = currentValue && currentValue !== "" ? currentValue : "all";
          
          return (
            <Select
              key={filter.key}
              value={selectValue}
              onValueChange={(value) => {
                // If "all" is selected, clear the filter (set to empty string)
                if (value === "all") {
                  onFilterChange?.(filter.key, "");
                } else {
                  onFilterChange?.(filter.key, value);
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {filter.label}</SelectItem>
                {filter.options.map((option) => {
                  // Ensure no empty string values in options
                  if (!option.value || option.value === "") {
                    console.warn(`Filter option for ${filter.key} has empty value, skipping`);
                    return null;
                  }
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          );
        })}

        {/* Clear Filters */}
        {hasActiveFilters && onClearFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear filters
          </Button>
        )}

        {/* Active Filters Badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1">
            {Object.entries(selectedFilters).map(([key, value]) => {
              if (!value) return null;
              const filter = filters.find((f) => f.key === key);
              const option = filter?.options.find((o) => o.value === value);
              return (
                <Badge key={key} variant="secondary" className="gap-1">
                  {filter?.label}: {option?.label || value}
                  <button
                    onClick={() => onFilterChange?.(key, "")}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Selected Count */}
        {selectedCount > 0 && (
          <div className="text-sm text-muted-foreground">
            {selectedCount} selected
          </div>
        )}

        {/* Bulk Actions */}
        {selectedCount > 0 && bulkActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Actions
                <MoreVertical className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {bulkActions.map((action, index) => (
                <DropdownMenuItem
                  key={index}
                  onClick={action.onClick}
                  className={action.variant === "destructive" ? "text-destructive" : ""}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Export */}
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        )}

        {/* Custom Actions */}
        {actions}
      </div>
    </div>
  );
}

