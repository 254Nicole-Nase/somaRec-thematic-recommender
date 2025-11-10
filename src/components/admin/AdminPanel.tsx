import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Users, 
  BookOpen,
  Shield,
  BarChart3
} from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { BooksManagement } from "./BooksManagement";
import { UsersManagement } from "./UsersManagement";
import { Analytics } from "./Analytics";

export function AdminPanel() {
  const { isAdmin } = useUser();

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-12 text-center">
            <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need administrator privileges to access this page.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl mb-2">Admin Panel</h1>
            <p className="text-muted-foreground">
              Manage books, users, and platform content
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <Shield className="h-3 w-3 mr-1" />
              Administrator
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="books" className="space-y-6">
          <TabsList>
            <TabsTrigger value="books">
              <BookOpen className="h-4 w-4 mr-2" />
              Books Management
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Books Management */}
          <TabsContent value="books">
            <BooksManagement />
          </TabsContent>

          {/* User Management */}
          <TabsContent value="users">
            <UsersManagement />
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics">
            <Analytics />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}