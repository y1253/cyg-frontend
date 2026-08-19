import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * "Mark message complete?" confirmation, shared by the Communications tab and the
 * internal Messages tab.
 *
 * Completing asks first (a stray click shouldn't clear a message); un-completing
 * applies straight away and never reaches this dialog. The two tabs differ only in
 * one sentence — company mailboxes are shared, an internal inbox is not — so that
 * sentence is a prop.
 */
export function CompleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  description: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark message complete?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
            onClick={onConfirm}
          >
            <CheckCircle2 size={14} /> Mark complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
