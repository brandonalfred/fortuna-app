"use client";

import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	Search,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AdminUser {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	role: string;
	emailVerified: boolean;
	createdAt: string;
	totalChats: number;
	lastActive: string | null;
}

interface UsersResponse {
	users: AdminUser[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

type SortField = "createdAt" | "email" | "firstName";
type SortDir = "asc" | "desc";

const SKELETON_ROWS = 5;
const COLUMN_COUNT = 7;

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatRelative(dateStr: string | null): string {
	if (!dateStr) return "Never";
	const diffMs = Date.now() - new Date(dateStr).getTime();
	const diffMin = Math.floor(diffMs / 60000);
	const diffHrs = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return "Just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHrs < 24) return `${diffHrs}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return formatDate(dateStr);
}

function SortIcon({
	field,
	sortBy,
	sortDir,
}: {
	field: SortField;
	sortBy: SortField;
	sortDir: SortDir;
}) {
	if (sortBy !== field) {
		return <ArrowUpDown className="h-3 w-3 text-text-tertiary" />;
	}
	if (sortDir === "asc") {
		return <ArrowUp className="h-3 w-3 text-accent-primary" />;
	}
	return <ArrowDown className="h-3 w-3 text-accent-primary" />;
}

function SkeletonRows() {
	return Array.from({ length: SKELETON_ROWS }, (_, row) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
		<tr key={row} className="border-b border-border-subtle">
			{Array.from({ length: COLUMN_COUNT }, (_, col) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells never reorder
				<td key={col} className="px-6 py-3">
					<div className="h-4 w-20 animate-pulse rounded bg-bg-tertiary" />
				</td>
			))}
		</tr>
	));
}

function EmptyMessage({ search }: { search: string }) {
	return (
		<tr>
			<td
				colSpan={COLUMN_COUNT}
				className="px-6 py-12 text-center text-sm text-text-tertiary"
			>
				{search ? "No users match your search." : "No users found."}
			</td>
		</tr>
	);
}

function ErrorMessage({ message }: { message: string }) {
	return (
		<tr>
			<td
				colSpan={COLUMN_COUNT}
				className="px-6 py-12 text-center text-sm text-red-400"
			>
				{message}
			</td>
		</tr>
	);
}

function UserRow({ user }: { user: AdminUser }) {
	return (
		<tr className="border-b border-border-subtle transition-colors hover:bg-bg-secondary">
			<td className="px-6 py-3">
				<span className="text-sm text-text-primary">
					{user.firstName} {user.lastName}
				</span>
			</td>
			<td className="px-6 py-3">
				<span className="text-sm text-text-secondary">{user.email}</span>
			</td>
			<td className="px-6 py-3">
				<span
					className={cn(
						"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
						user.role === "admin"
							? "bg-accent-muted text-accent-primary"
							: "bg-bg-tertiary text-text-secondary",
					)}
				>
					{user.role}
				</span>
			</td>
			<td className="px-6 py-3">
				<span className="text-sm text-text-secondary">{user.totalChats}</span>
			</td>
			<td className="px-6 py-3">
				<span
					className={cn(
						"inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
						user.emailVerified
							? "bg-success-subtle text-success"
							: "bg-bg-tertiary text-text-tertiary",
					)}
				>
					{user.emailVerified ? "Y" : "N"}
				</span>
			</td>
			<td className="px-6 py-3">
				<span className="text-sm text-text-tertiary">
					{formatRelative(user.lastActive)}
				</span>
			</td>
			<td className="px-6 py-3">
				<span className="text-sm text-text-tertiary">
					{formatDate(user.createdAt)}
				</span>
			</td>
		</tr>
	);
}

function TableBody({
	loading,
	error,
	data,
	search,
}: {
	loading: boolean;
	error: string | null;
	data: UsersResponse | null;
	search: string;
}) {
	if (loading && !data) {
		return <SkeletonRows />;
	}
	if (error) {
		return <ErrorMessage message={error} />;
	}
	if (!data?.users.length) {
		return <EmptyMessage search={search} />;
	}
	return data.users.map((user) => <UserRow key={user.id} user={user} />);
}

export default function AdminUsersPage() {
	const [data, setData] = useState<UsersResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [activeSearch, setActiveSearch] = useState("");
	const [sortBy, setSortBy] = useState<SortField>("createdAt");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [page, setPage] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const searchParams = new URLSearchParams({
					search: activeSearch,
					sortBy,
					sortDir,
					page: String(page),
					limit: "20",
				});
				const res = await fetch(`/api/admin/users?${searchParams}`);
				if (cancelled) return;
				if (res.status === 403) {
					setError("You don't have permission to view this page.");
					return;
				}
				if (!res.ok) {
					setError("Failed to load users. Please try again.");
					return;
				}
				setData(await res.json());
			} catch {
				if (!cancelled) {
					setError(
						"Network error. Please check your connection and try again.",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [activeSearch, sortBy, sortDir, page]);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	function handleSearchChange(value: string) {
		setSearch(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setPage(1);
			setActiveSearch(value);
		}, 300);
	}

	function handleSort(field: SortField) {
		if (sortBy === field) {
			setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortBy(field);
			setSortDir("asc");
		}
		setPage(1);
	}

	const sortHeaderClass =
		"flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-tertiary transition-colors hover:text-text-primary";
	const staticHeaderClass =
		"text-xs font-medium uppercase tracking-wider text-text-tertiary";

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="border-b border-border-subtle px-6 py-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted">
							<Users className="h-4 w-4 text-accent-primary" />
						</div>
						<div>
							<h2 className="text-base font-medium text-text-primary">Users</h2>
							{data && (
								<p className="text-xs text-text-tertiary">
									{data.total} total user{data.total !== 1 ? "s" : ""}
								</p>
							)}
						</div>
					</div>

					<div className="relative w-64">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
						<Input
							value={search}
							onChange={(e) => handleSearchChange(e.target.value)}
							placeholder="Search by name or email..."
							className="pl-9"
						/>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<table className="w-full">
					<thead className="sticky top-0 z-10 bg-bg-primary">
						<tr className="border-b border-border-subtle">
							<th className="px-6 py-3 text-left">
								<button
									type="button"
									onClick={() => handleSort("firstName")}
									className={sortHeaderClass}
								>
									Name
									<SortIcon
										field="firstName"
										sortBy={sortBy}
										sortDir={sortDir}
									/>
								</button>
							</th>
							<th className="px-6 py-3 text-left">
								<button
									type="button"
									onClick={() => handleSort("email")}
									className={sortHeaderClass}
								>
									Email
									<SortIcon field="email" sortBy={sortBy} sortDir={sortDir} />
								</button>
							</th>
							<th className="px-6 py-3 text-left">
								<span className={staticHeaderClass}>Role</span>
							</th>
							<th className="px-6 py-3 text-left">
								<span className={staticHeaderClass}>Chats</span>
							</th>
							<th className="px-6 py-3 text-left">
								<span className={staticHeaderClass}>Verified</span>
							</th>
							<th className="px-6 py-3 text-left">
								<span className={staticHeaderClass}>Last Active</span>
							</th>
							<th className="px-6 py-3 text-left">
								<button
									type="button"
									onClick={() => handleSort("createdAt")}
									className={sortHeaderClass}
								>
									Joined
									<SortIcon
										field="createdAt"
										sortBy={sortBy}
										sortDir={sortDir}
									/>
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						<TableBody
							loading={loading}
							error={error}
							data={data}
							search={search}
						/>
					</tbody>
				</table>
			</div>

			{data && data.totalPages > 1 && (
				<div className="flex items-center justify-between border-t border-border-subtle px-6 py-3">
					<p className="text-xs text-text-tertiary">
						Page {data.page} of {data.totalPages}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((p) => p - 1)}
						>
							<ChevronLeft className="mr-1 h-3 w-3" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= data.totalPages}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
							<ChevronRight className="ml-1 h-3 w-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
