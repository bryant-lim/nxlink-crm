export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string; // Display Name within system
  mobile?: string | null;
  role: 'admin' | 'support' | 'sales';
  is_active: boolean;
  created_at?: string;
}

export interface Ticket {
  id: string;
  conversation_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  company_name?: string | null;
  title: string;
  description?: string | null;
  category?: 'Support' | 'Sales-Follow Up' | 'Billing' | 'Bug Report' | 'Emergency' | string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed' | string;
  assigned_to_role?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  responded_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface TicketActivityLog {
  id: string;
  ticket_id: string;
  actor_name: string;
  action_type: 'owner_changed' | 'status_changed' | 'priority_changed' | 'category_changed' | 'note_added' | string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

export interface TicketNote {
  id: string;
  ticket_id: string;
  author_name: string;
  note_text: string;
  created_at: string;
}

export interface CustomerProfile {
  phone_number: string;
  customer_name?: string | null;
  company_name?: string | null;
  email_address?: string | null;
  health_score: number;
  health_status: 'excellent' | 'good' | 'at_risk' | 'critical';
  account_status?: 'lead' | 'active_customer' | 'retained' | 'churn_risk';
  total_conversations?: number;
  last_interaction_at?: string;
  created_at?: string;
}

export interface ConversationData {
  id: string;
  customer_name?: string | null;
  phone_number?: string | null;
  email_address?: string | null;
  customer_sentiment?: string | null;
  company_name?: string | null;
  conversation_summary?: string | null;
  conversation_date?: string | null;
  conversation_time?: string | null;
  conversation_tags?: string[] | null;
  conversation_transcript?: string | null;
  next_steps?: string | null;
  call_audio_url?: string | null;
  created_at: string;
}

// Standardize phone number
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone) return 'Unknown';
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return phone.trim();
  return digits;
}

// Calculate SLA Due Dates based on priority
export function calculateSLADeadlines(priority: 'urgent' | 'high' | 'medium' | 'low', fromDate = new Date()) {
  const responseDue = new Date(fromDate);
  const resolutionDue = new Date(fromDate);

  switch (priority) {
    case 'urgent':
      responseDue.setHours(responseDue.getHours() + 1);
      resolutionDue.setHours(resolutionDue.getHours() + 4);
      break;
    case 'high':
      responseDue.setHours(responseDue.getHours() + 4);
      resolutionDue.setHours(resolutionDue.getHours() + 24);
      break;
    case 'medium':
      responseDue.setHours(responseDue.getHours() + 12);
      resolutionDue.setHours(resolutionDue.getHours() + 48);
      break;
    case 'low':
    default:
      responseDue.setHours(responseDue.getHours() + 24);
      resolutionDue.setHours(resolutionDue.getHours() + 72);
      break;
  }

  return {
    first_response_due_at: responseDue.toISOString(),
    resolution_due_at: resolutionDue.toISOString(),
  };
}

// Format remaining SLA time
export function getSLATimerStatus(dueIso?: string | null, isCompleted = false): { label: string; isBreached: boolean; color: string } {
  if (!dueIso) return { label: 'No SLA', isBreached: false, color: 'text-slate-400 bg-slate-50' };
  if (isCompleted) return { label: 'Fulfilled', isBreached: false, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };

  const due = new Date(dueIso).getTime();
  const now = new Date().getTime();
  const diffMs = due - now;

  if (diffMs <= 0) {
    const overdueMins = Math.abs(Math.floor(diffMs / (1000 * 60)));
    const hours = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    const overStr = hours > 0 ? `${hours}h ${mins}m overdue` : `${mins}m overdue`;
    return { label: `Breached (${overStr})`, isBreached: true, color: 'text-red-700 bg-red-50 border-red-200' };
  }

  const remainingMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(remainingMins / 60);
  const mins = remainingMins % 60;

  if (hours < 2) {
    return { label: `${hours > 0 ? `${hours}h ` : ''}${mins}m left`, isBreached: false, color: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse' };
  } else {
    return { label: `${hours}h ${mins}m left`, isBreached: false, color: 'text-blue-700 bg-blue-50 border-blue-200' };
  }
}

// Calculate Account Health Score
export function calculateAccountHealthScore(
  conversations: ConversationData[],
  tickets: Ticket[]
): { score: number; status: 'excellent' | 'good' | 'at_risk' | 'critical'; breakdown: Record<string, number> } {
  let score = 100;
  const breakdown: Record<string, number> = { base: 100 };

  let sentimentDeduction = 0;
  let hasRecentNegative = false;
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  conversations.forEach((c) => {
    const sent = c.customer_sentiment?.toLowerCase() || '';
    const convoDate = new Date(c.created_at || c.conversation_date || Date.now());

    if (sent.includes('emergency') || sent.includes('dh - emergency') || sent.includes('critical')) {
      sentimentDeduction += 40;
      if (convoDate >= fourteenDaysAgo) hasRecentNegative = true;
    } else if (sent.includes('negative') || sent.includes('frustrated') || sent.includes('bad') || sent.includes('angry')) {
      sentimentDeduction += 25;
      if (convoDate >= fourteenDaysAgo) hasRecentNegative = true;
    } else if (sent.includes('neutral') || sent.includes('mixed')) {
      sentimentDeduction += 10;
    }
  });

  breakdown['sentiment_deduction'] = -sentimentDeduction;
  score -= sentimentDeduction;

  let ticketDeduction = 0;
  let slaBreachDeduction = 0;
  let slaBonus = 0;

  tickets.forEach((t) => {
    const isClosed = t.status === 'resolved' || t.status === 'closed';

    if (!isClosed) {
      if (t.priority === 'urgent') ticketDeduction += 20;
      else if (t.priority === 'high') ticketDeduction += 10;
      else if (t.priority === 'medium') ticketDeduction += 5;
    }

    if (t.resolution_due_at) {
      const dueTime = new Date(t.resolution_due_at).getTime();
      const resolvedTime = t.resolved_at ? new Date(t.resolved_at).getTime() : Date.now();

      if (resolvedTime > dueTime && !isClosed) {
        slaBreachDeduction += 25;
      } else if (resolvedTime <= dueTime && isClosed) {
        slaBonus += 10;
      }
    }
  });

  breakdown['active_tickets_deduction'] = -ticketDeduction;
  breakdown['sla_breach_deduction'] = -slaBreachDeduction;
  breakdown['sla_bonus'] = slaBonus;

  score = score - ticketDeduction - slaBreachDeduction + slaBonus;

  if (!hasRecentNegative && conversations.length > 0) {
    score += 10;
    breakdown['recency_bonus'] = 10;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let status: 'excellent' | 'good' | 'at_risk' | 'critical' = 'excellent';
  if (finalScore >= 90) status = 'excellent';
  else if (finalScore >= 70) status = 'good';
  else if (finalScore >= 40) status = 'at_risk';
  else status = 'critical';

  return { score: finalScore, status, breakdown };
}

// Auto Ticket Priority & Category Evaluator
export function evaluateAutoTicketRules(
  tags: string[] = [],
  sentiment: string = '',
  summary: string = ''
): { shouldCreate: boolean; priority: 'urgent' | 'high' | 'medium' | 'low'; title: string; category: string; assigned_to_role: string } {
  const combinedText = [...tags, sentiment, summary].join(' ').toLowerCase();

  if (combinedText.includes('dh - emergency') || combinedText.includes('emergency') || combinedText.includes('critical bug')) {
    return {
      shouldCreate: true,
      priority: 'urgent',
      category: 'Emergency',
      title: '🚨 Emergency Ticket: Immediate Support Attention Required',
      assigned_to_role: 'support_manager',
    };
  }

  if (
    combinedText.includes('hot lead') || 
    combinedText.includes('dh - hot lead') ||
    combinedText.includes('booking appointment') ||
    combinedText.includes('sales lead') || 
    combinedText.includes('demo requested') || 
    combinedText.includes('pricing') ||
    combinedText.includes('consultation')
  ) {
    return {
      shouldCreate: true,
      priority: 'high',
      category: 'Sales-Follow Up',
      title: '🔥 Sales-Follow Up: Hot Lead Follow-Up Required',
      assigned_to_role: 'sales',
    };
  }

  if (combinedText.includes('bug report') || combinedText.includes('refund') || combinedText.includes('billing issue') || combinedText.includes('negative')) {
    return {
      shouldCreate: true,
      priority: 'medium',
      category: 'Bug Report',
      title: '⚠️ Support Case: Customer Issue Follow-up',
      assigned_to_role: 'support',
    };
  }

  return {
    shouldCreate: true,
    priority: 'medium',
    category: 'Support',
    title: '⚡ Support Ticket: General Follow-Up',
    assigned_to_role: 'support',
  };
}
