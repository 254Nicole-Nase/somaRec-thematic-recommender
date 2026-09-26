import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { useUser } from "../contexts/UserContext";
import { supabase } from "../utils/supabase/client";

interface Review {
  id: string;
  user_id: string;
  display_name: string | null;
  rating: number;
  body: string | null;
  created_at: string;
}

interface BookReviewsProps {
  bookId: string;
  onLoginRequired?: () => void;
}

function Stars({ value, onChange, size = 5 }: { value: number; onChange?: (v: number) => void; size?: 4 | 5 }) {
  const dims = size === 4 ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex items-center gap-1" role={onChange ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`${dims} ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

/** Goodreads-style ratings and reviews, stored in the Supabase `reviews` table. */
export function BookReviews({ bookId, onLoginRequired }: BookReviewsProps) {
  const { user } = useUser();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reviews")
      .select("id, user_id, display_name, rating, body, created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    if (error) {
      // Table missing until the migration is applied; hide the section quietly.
      setUnavailable(true);
      setReviews([]);
    } else {
      setUnavailable(false);
      setReviews(data || []);
      const mine = (data || []).find((r) => r.user_id === user?.id);
      setRating(mine?.rating || 0);
      setBody(mine?.body || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, user?.id]);

  const submit = async () => {
    if (!user) {
      onLoginRequired?.();
      return;
    }
    if (rating < 1) {
      setError("Pick a rating from 1 to 5 stars.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("reviews").upsert(
      {
        book_id: bookId,
        user_id: user.id,
        display_name: user.name,
        rating,
        body: body.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "book_id,user_id" }
    );
    setSaving(false);
    if (error) {
      setError("Could not save your review. Please try again.");
      return;
    }
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("reviews").delete().eq("id", id);
    setRating(0);
    setBody("");
    load();
  };

  if (unavailable) return null;

  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const mine = reviews.find((r) => r.user_id === user?.id);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl">Ratings &amp; Reviews</h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Stars value={Math.round(average)} size={4} />
              <span>
                {average.toFixed(1)} · {reviews.length} rating{reviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">{mine ? "Your review" : "Rate this book"}</p>
          <Stars value={rating} onChange={setRating} />
          <Textarea
            placeholder="What did you think? Would you recommend it to a student or book club?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving}>
              {user ? (saving ? "Saving..." : mine ? "Update review" : "Post review") : "Log in to review"}
            </Button>
            {mine && (
              <Button variant="outline" onClick={() => remove(mine.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share what you thought.</p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.display_name || "Reader"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <Stars value={r.rating} size={4} />
                {r.body && <p className="mt-2 text-sm leading-relaxed" style={{ whiteSpace: "pre-line" }}>{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
