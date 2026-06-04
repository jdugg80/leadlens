// web/src/components/BatchEnrichmentPanel.jsx
// Admin panel for batch lead enrichment across all 50 states

import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Zap,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
} from "lucide-react";

export function BatchEnrichmentPanel() {
  const [filters, setFilters] = useState({
    state: "",
    territory: "",
    status: "not_enriched", // not_enriched | partial | all
  });
  const [limit, setLimit] = useState(100);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleEnrich = async () => {
    setEnriching(true);
    setError(null);
    setProgress({ status: "starting", loaded: 0, total: 0 });

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "enrich-lead-batch",
        {
          body: {
            filters: Object.fromEntries(
              Object.entries(filters).filter(([, v]) => v)
            ),
            limit: Math.min(parseInt(limit) || 100, 1000),
          },
        }
      );

      if (fnError) throw fnError;

      setResults(data);
      setProgress({ status: "complete", ...data });
    } catch (err) {
      setError(err.message);
      setProgress({ status: "failed", error: err.message });
    } finally {
      setEnriching(false);
    }
  };

  const statsCards = [
    {
      label: "Total Processed",
      value: results?.total_leads || 0,
      icon: Clock,
      color: "bg-blue-900/30 border-blue-700",
    },
    {
      label: "Fully Enriched",
      value: results?.enriched || 0,
      icon: CheckCircle,
      color: "bg-green-900/30 border-green-700",
    },
    {
      label: "Partial Data",
      value: results?.partial || 0,
      icon: AlertCircle,
      color: "bg-yellow-900/30 border-yellow-700",
    },
    {
      label: "Failed",
      value: results?.failed || 0,
      icon: AlertCircle,
      color: "bg-red-900/30 border-red-700",
    },
    {
      label: "Cache Hits",
      value: results?.cached || 0,
      icon: Zap,
      color: "bg-purple-900/30 border-purple-700",
    },
  ];

  return (
    <div className="bg-[#1A1D26] rounded-lg border border-[#B8BDD0]/20 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap size={24} className="text-[#00C9FF]" />
          Batch Lead Enrichment
        </h2>
        <span className="text-sm text-[#B8BDD0]">
          Enrich up to 1,000 leads across all 50 states
        </span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-[#B8BDD0] mb-2">
            State (Optional)
          </label>
          <select
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            disabled={enriching}
            className="w-full px-3 py-2 bg-[#080A0F] border border-[#B8BDD0]/20 rounded text-white text-sm focus:border-[#00C9FF] focus:outline-none disabled:opacity-50"
          >
            <option value="">All States</option>
            {[
              "AL",
              "AK",
              "AZ",
              "AR",
              "CA",
              "CO",
              "CT",
              "DE",
              "FL",
              "GA",
              "HI",
              "ID",
              "IL",
              "IN",
              "IA",
              "KS",
              "KY",
              "LA",
              "ME",
              "MD",
              "MA",
              "MI",
              "MN",
              "MS",
              "MO",
              "MT",
              "NE",
              "NV",
              "NH",
              "NJ",
              "NM",
              "NY",
              "NC",
              "ND",
              "OH",
              "OK",
              "OR",
              "PA",
              "RI",
              "SC",
              "SD",
              "TN",
              "TX",
              "UT",
              "VT",
              "VA",
              "WA",
              "WV",
              "WI",
              "WY",
            ].map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#B8BDD0] mb-2">
            Territory (Optional)
          </label>
          <input
            type="text"
            value={filters.territory}
            onChange={(e) => setFilters({ ...filters, territory: e.target.value })}
            disabled={enriching}
            placeholder="e.g., North Texas"
            className="w-full px-3 py-2 bg-[#080A0F] border border-[#B8BDD0]/20 rounded text-white text-sm placeholder-[#B8BDD0]/40 focus:border-[#00C9FF] focus:outline-none disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#B8BDD0] mb-2">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            disabled={enriching}
            className="w-full px-3 py-2 bg-[#080A0F] border border-[#B8BDD0]/20 rounded text-white text-sm focus:border-[#00C9FF] focus:outline-none disabled:opacity-50"
          >
            <option value="not_enriched">Not Enriched</option>
            <option value="partial">Partial Data</option>
            <option value="all">All Leads</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#B8BDD0] mb-2">
            Limit (Max 1000)
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(parseInt(e.target.value) || 100, 1000))}
            disabled={enriching}
            min="1"
            max="1000"
            className="w-full px-3 py-2 bg-[#080A0F] border border-[#B8BDD0]/20 rounded text-white text-sm focus:border-[#00C9FF] focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleEnrich}
          disabled={enriching}
          className="flex items-center gap-2 px-6 py-3 bg-[#00C9FF] text-black font-semibold rounded hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {enriching ? (
            <>
              <Pause size={18} className="animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <Play size={18} />
              Start Enrichment
            </>
          )}
        </button>

        {results && (
          <button
            onClick={() => exportResults(results)}
            className="flex items-center gap-2 px-6 py-3 bg-[#7B3FBE] text-white font-semibold rounded hover:bg-opacity-90 transition"
          >
            <BarChart3 size={18} />
            Export CSV
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded flex gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-200">Enrichment Failed</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {enriching && progress && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-[#B8BDD0]">
              Enriching leads...
            </span>
            <span className="text-sm text-[#B8BDD0]/60">
              {progress.loaded || 0}/{progress.total || "?"}
            </span>
          </div>
          <div className="w-full h-2 bg-[#080A0F] rounded-full overflow-hidden border border-[#B8BDD0]/20">
            <div
              className="h-full bg-gradient-to-r from-[#00C9FF] to-[#7B3FBE] transition-all"
              style={{
                width: progress.total ? `${(progress.loaded / progress.total) * 100}%` : "5%",
              }}
            />
          </div>
        </div>
      )}

      {/* Results Stats */}
      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {statsCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`p-4 rounded border ${card.color}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={18} className="text-[#00C9FF]" />
                    <span className="text-xs font-medium text-[#B8BDD0] uppercase">
                      {card.label}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {card.value}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-[#080A0F] p-4 rounded border border-[#B8BDD0]/20">
              <p className="text-[#B8BDD0]">Completion Rate</p>
              <p className="text-2xl font-bold text-white">
                {results.total_leads > 0
                  ? Math.round(
                      ((results.enriched + results.cached) / results.total_leads) *
                        100
                    )
                  : 0}
                %
              </p>
            </div>
            <div className="bg-[#080A0F] p-4 rounded border border-[#B8BDD0]/20">
              <p className="text-[#B8BDD0]">Duration</p>
              <p className="text-2xl font-bold text-white">
                {results.duration_seconds.toFixed(1)}s
              </p>
            </div>
          </div>

          {/* Data Found Summary */}
          <div className="mt-6 p-4 bg-[#080A0F] rounded border border-[#B8BDD0]/20">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              Data Successfully Found
            </h4>
            <div className="space-y-2 text-sm">
              {getEnrichmentStats(results.results).map(([label, count, pct]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-[#B8BDD0]">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-1.5 bg-[#1A1D26] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[#B8BDD0]/60 w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getEnrichmentStats(results) {
  let addressCount = 0;
  let phoneCount = 0;
  let emailCount = 0;
  let pocCount = 0;

  results.forEach((result) => {
    if (result.address_google_maps || result.address_state_registry) addressCount++;
    if (result.phone_google_maps || result.phone_website) phoneCount++;
    if (result.emails_domain_pattern?.length || result.emails_website?.length) emailCount++;
    if (result.poc_name) pocCount++;
  });

  const total = results.length;
  const stats = [
    ["Address", addressCount, Math.round((addressCount / total) * 100)],
    ["Phone Number", phoneCount, Math.round((phoneCount / total) * 100)],
    ["Email", emailCount, Math.round((emailCount / total) * 100)],
    ["Point of Contact", pocCount, Math.round((pocCount / total) * 100)],
  ];

  return stats.sort((a, b) => b[1] - a[1]);
}

function exportResults(results) {
  const csv = [
    ["Lead ID", "Status", "Enriched", "Partial", "Failed"],
    ...results.results.map((r) => [
      r.lead_id,
      r.status,
      r.status === "complete" ? "✓" : "",
      r.status === "partial" ? "✓" : "",
      r.status === "failed" ? "✓" : "",
    ]),
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enrichment-results-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
