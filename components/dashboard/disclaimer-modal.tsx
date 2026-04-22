import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DisclaimerModalProps = {
  onAcknowledge: () => void;
};

export function DisclaimerModal({ onAcknowledge }: DisclaimerModalProps) {
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-[rgba(4,8,18,0.92)] px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="important-notice-title"
      aria-describedby="important-notice-description"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(56,113,224,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[32rem] bg-[radial-gradient(circle_at_right,rgba(216,168,77,0.12),transparent_58%)]" />

      <Card className="relative z-10 w-full max-w-2xl overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(11,17,30,0.98),rgba(7,11,21,0.98))] shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
        <CardHeader className="border-b border-white/6 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                HareAssets
              </Badge>
              <CardTitle id="important-notice-title" className="mt-3 text-2xl">
                Important Notice
              </CardTitle>
            </div>
          </div>
          <CardDescription
            id="important-notice-description"
            className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground"
          >
            <p>
              This platform is for educational and informational purposes only. It
              does not provide financial advice, and nothing shown here should be
              used as the sole basis for trading decisions.
            </p>
            <p>
              Trading involves risk. You are fully responsible for your own
              decisions.
            </p>
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <Button type="button" className="w-full" onClick={onAcknowledge}>
            I Understand
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
