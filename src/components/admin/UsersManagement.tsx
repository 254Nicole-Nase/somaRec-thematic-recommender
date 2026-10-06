import * as React from "react";
import { DataTable, Column } from "./DataTable";
import { DataTableToolbar, FilterOption } from "./DataTableToolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Eye, EyeOff, Loader2, Shield, Users } from "lucide-react";
import { exportToCSV } from "../../utils/exportToCSV";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../contexts/UserContext";

interface User {
  id: string;
  email: string;
  name: string;
  role: "reader" | "admin";
  is_admin?: boolean; // Support both role and is_admin
  createdAt: string;
  lastActive: string;
  isActive: boolean;
}

export function UsersManagement() {
  const { user: currentUser, loading: userLoading } = useUser();
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchValue, setSearchValue] = React.useState("");
  const [selectedFilters, setSelectedFilters] = React.useState<Record<string, string>>({});
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = React.useState<string>("");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc" | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [error, setError] = React.useState<string | null>(null);

  // Load users from Supabase profiles table
  const loadUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Query profiles table directly
      // RLS policies will ensure only admins can see all profiles
      // If you're admin, you should see all profiles
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("id, email, name, role, is_admin, is_active, created_at, updated_at, last_active")
        .order("created_at", { ascending: false });
      
      console.log(`[UsersManagement] Loaded ${data?.length || 0} users from profiles table`);
      if (data && data.length > 0) {
        console.log(`[UsersManagement] Sample user:`, data[0]);
        console.log(`[UsersManagement] All users:`, data);
      }
      
      if (queryError) {
        console.error("[UsersManagement] Error loading users:", queryError);
        console.error("[UsersManagement] Error code:", queryError.code);
        console.error("[UsersManagement] Error message:", queryError.message);
        console.error("[UsersManagement] Error details:", queryError.details);
        console.error("[UsersManagement] Error hint:", queryError.hint);
        
        // Check if it's a permission error
        if (queryError.code === "42501" || queryError.message?.includes("permission")) {
          setError("Admin access required. You need to be an admin to view users. Please ensure your user has the 'admin' role in the profiles table.");
        } else if (queryError.code === "42P01") {
          setError("Profiles table not found. Please run the migration to create the profiles table (011_create_profiles_table.sql).");
        } else {
          setError(`Failed to load users: ${queryError.message}`);
        }
        setUsers([]);
        return;
      }

      if (data) {
        // Map profiles data to User interface
        // Support both role field and is_admin field
        const mappedUsers: User[] = data.map((profile: any) => {
          // Determine role: use role field if available, otherwise use is_admin
          let userRole: "reader" | "admin" = "reader";
          if (profile.role === "admin" || profile.is_admin === true) {
            userRole = "admin";
          }
          
          return {
            id: profile.id,
            email: profile.email || "",
            name: profile.name || profile.email || "User",
            role: userRole,
            is_admin: profile.is_admin || userRole === "admin",
            createdAt: profile.created_at || new Date().toISOString(),
            lastActive: profile.last_active || profile.updated_at || new Date().toISOString(),
            isActive: profile.is_active !== false, // Default to true if null
          };
        });
        
        setUsers(mappedUsers);
        setError(null);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error("Error loading users:", err);
      setError("An unexpected error occurred while loading users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Only load users after user authentication is complete
    if (!userLoading && currentUser) {
      loadUsers();
    }
  }, [userLoading, currentUser, loadUsers]);

  // Filter and search users
  const filteredUsers = React.useMemo(() => {
    let filtered = [...users];

    // Search filter
    if (searchValue) {
      const search = searchValue.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.name?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search) ||
          user.role?.toLowerCase().includes(search)
      );
    }

    // Role filter
    if (selectedFilters.role) {
      filtered = filtered.filter((user) => user.role === selectedFilters.role);
    }

    // Status filter
    if (selectedFilters.status) {
      const isActive = selectedFilters.status === "active";
      filtered = filtered.filter((user) => user.isActive === isActive);
    }

    // Sorting
    if (sortBy && sortDirection) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortBy as keyof User];
        let bValue: any = b[sortBy as keyof User];

        // Handle special cases
        if (sortBy === "status") {
          aValue = a.isActive;
          bValue = b.isActive;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [users, searchValue, selectedFilters, sortBy, sortDirection]);

  // Filter options
  const filterOptions: FilterOption[] = React.useMemo(
    () => [
      {
        key: "role",
        label: "Role",
        options: [
          { value: "admin", label: "Admin" },
          { value: "reader", label: "Reader" },
        ],
      },
      {
        key: "status",
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    []
  );

  // Handle sort
  const handleSort = (columnId: string, direction: "asc" | "desc" | null) => {
    setSortBy(direction ? columnId : "");
    setSortDirection(direction);
    setPage(1);
  };

  // Handle filter change
  const handleFilterChange = (key: string, value: string) => {
    setSelectedFilters((prev) => {
      const newFilters = { ...prev };
      if (value === "") {
        delete newFilters[key];
      } else {
        newFilters[key] = value;
      }
      return newFilters;
    });
    setPage(1);
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setSelectedFilters({});
    setSearchValue("");
    setPage(1);
  };

  // Toggle user status
  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      // Use the database function to update user status
      // This will check admin permissions via RLS
      const { error } = await supabase.rpc("update_user_status", {
        user_id: userId,
        active: isActive,
      });

      if (error) {
        console.error("Error updating user status:", error);
        alert(`Failed to update user status: ${error.message}`);
        return;
      }

      // Update local state optimistically
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive } : u)));
      console.log(`User ${isActive ? "activated" : "deactivated"} successfully`);
      
      // Reload users to ensure data is fresh
      await loadUsers();
    } catch (err) {
      console.error("Error updating user status:", err);
      alert("An unexpected error occurred while updating user status");
      // Reload users on error to sync state
      await loadUsers();
    }
  };

  // Handle export
  const handleExport = () => {
    const dataToExport =
      selectedRows.size > 0
        ? filteredUsers.filter((user) => selectedRows.has(user.id))
        : filteredUsers;

    exportToCSV(
      dataToExport,
      `users-export-${new Date().toISOString().split("T")[0]}.csv`,
      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
        { key: "isActive", label: "Active" },
        { key: "createdAt", label: "Created At" },
        { key: "lastActive", label: "Last Active" },
      ]
    );
    console.log(`Exported ${dataToExport.length} user(s) to CSV`);
  };

  // Define columns
  const columns: Column<User>[] = React.useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        sortable: true,
        cell: (row) => <div className="font-medium">{row.name || "—"}</div>,
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        sortable: true,
      },
      {
        id: "role",
        header: "Role",
        accessorKey: "role",
        sortable: true,
        cell: (row) => (
          <Badge variant={row.role === "admin" ? "default" : "secondary"} className="capitalize">
            {row.role === "admin" && <Shield className="h-3 w-3 mr-1" />}
            {row.role}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "isActive",
        sortable: true,
        cell: (row) => (
          <Badge variant={row.isActive ? "default" : "destructive"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "createdAt",
        header: "Joined",
        accessorKey: "createdAt",
        sortable: true,
        cell: (row) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.createdAt).toLocaleDateString()}
          </div>
        ),
      },
      {
        id: "lastActive",
        header: "Last Active",
        accessorKey: "lastActive",
        sortable: true,
        cell: (row) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.lastActive).toLocaleDateString()}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to ${row.isActive ? "deactivate" : "activate"} ${row.name || row.email}?`)) {
                  toggleUserStatus(row.id, !row.isActive);
                }
              }}
              disabled={row.id === currentUser?.id}
            >
              {row.isActive ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        ),
      },
    ],
    [currentUser]
  );

  if (loading && users.length === 0 && !error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage platform users and their access
            {users.length > 0 && ` (${users.length} users)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                      User Management Unavailable
                    </h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
                  </div>
                  
                  <div className="border-t border-amber-200 dark:border-amber-800 pt-3">
                    <p className="font-medium text-sm text-amber-900 dark:text-amber-100 mb-2">
                      Recommended Solutions:
                    </p>
                    <div className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <span className="font-medium">1.</span>
                        <div>
                          <p className="font-medium">Use Supabase Dashboard (Quickest)</p>
                          <p className="text-xs opacity-80">
                            Go to Authentication → Users in your Supabase Dashboard to manage users directly.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-medium">2.</span>
                        <div>
                          <p className="font-medium">Run Database Migration</p>
                          <p className="text-xs opacity-80">
                            Apply migration <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">013_setup_profiles_for_admin.sql</code> in Supabase SQL Editor.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-medium">3.</span>
                        <div>
                          <p className="font-medium">Set Admin Status</p>
                          <p className="text-xs opacity-80">
                            Run in SQL Editor: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">UPDATE profiles SET is_admin = true WHERE id = 'your-user-id'</code>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    loadUsers();
                  }}
                  className="shrink-0"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Empty State - Only show if no error and no users */}
          {!loading && !error && users.length === 0 && (
            <div className="rounded-lg border p-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl mb-2">No Users Found</h3>
              <p className="text-muted-foreground mb-4">
                No users found in the profiles table. Users will be automatically added when they sign up.
              </p>
            </div>
          )}

          {/* DataTable and Toolbar - Only show when we have users and no error */}
          {!error && users.length > 0 && (
            <>
              {/* Toolbar */}
              <DataTableToolbar
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                searchPlaceholder="Search users by name, email, role..."
                filters={filterOptions}
                selectedFilters={selectedFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                selectedCount={selectedRows.size}
                onExport={handleExport}
              />

              {/* DataTable */}
              <DataTable
                data={filteredUsers}
                columns={columns}
                selectable
                selectedRows={selectedRows}
                onSelectionChange={setSelectedRows}
                getRowId={(row) => row.id}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={handleSort}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                emptyMessage="No users found. Try adjusting your filters."
              />

              {/* Stats */}
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                <div>
                  {filteredUsers.length} of {users.length} users
                  {filteredUsers.length !== users.length && " (filtered)"}
                </div>
                <div>
                  {selectedRows.size > 0 && `${selectedRows.size} selected`}
                  <span className="ml-4">
                    {users.filter((u) => u.isActive).length} active,{" "}
                    {users.filter((u) => u.role === "admin").length} admin
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

