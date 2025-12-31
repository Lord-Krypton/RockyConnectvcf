// Supabase client initialization
const supabaseUrl = 'https://jtbztvfzzqdvruxbpzpa.supabase.co';
const supabaseKey = 'sb_publishable_DqBuo34Vc90IVaxcpdza_A_qzkNX4hw';

const supabase = Supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', async () => {
  const isOwnerPage = document.getElementById('createSession');
  const isParticipantPage = document.getElementById('contactForm');

  if (isOwnerPage) {
    const createBtn = document.getElementById('createSession');
    const sessionsList = document.getElementById('sessionsList');
    const noSessionsMsg = document.getElementById('noSessions');

    createBtn.addEventListener('click', async () => {
      // Generate short 8-char code
      const sessionCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase
        .from('sessions')
        .insert({ session_code: sessionCode })
        .select()
        .single();

      if (error) {
        alert('Error creating session: ' + error.message);
        return;
      }

      await renderSessions();

      const link = `\( {window.location.origin} \){window.location.pathname.replace('owner.html', 'participant.html')}?session=${sessionCode}`;
      navigator.clipboard.writeText(link).then(() => {
        alert(`Session created! 🎉\nCode: \( {sessionCode}\nShare link:\n \){link}\n(Copied to clipboard)`);
      });
    });

    const renderSessions = async () => {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, session_code, active, created_at')
        .order('created_at', { ascending: false });

      if (error || !sessions || sessions.length === 0) {
        noSessionsMsg.style.display = 'block';
        sessionsList.innerHTML = '';
        return;
      }

      noSessionsMsg.style.display = 'none';

      // Fetch contact counts
      const sessionIds = sessions.map(s => s.id);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('session_id', { count: 'exact' })
        .in('session_id', sessionIds);

      const countMap = {};
      contacts?.forEach(c => {
        countMap[c.session_id] = (countMap[c.session_id] || 0) + 1;
      });

      sessionsList.innerHTML = sessions.map(session => `
        <div class="p-6 rounded-2xl card-glass border-glow shadow-glow">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold text-[var(--primary)]">Session: ${session.session_code}</h3>
              <p class="text-sm text-slate-400">Created: ${new Date(session.created_at).toLocaleString()}</p>
              <p class="text-lg mt-2">${countMap[session.id] || 0} contacts</p>
            </div>
            <span class="px-3 py-1 rounded-full text-sm ${session.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
              ${session.active ? 'Active' : 'Ended'}
            </span>
          </div>
          <div class="flex gap-3 mt-6">
            <button onclick="downloadVCF('${session.id}')" class="flex-1 py-3 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] font-medium">
              📥 Download VCF
            </button>
            <button onclick="toggleSession('\( {session.id}', \){!session.active})" class="px-6 py-3 rounded-lg bg-red-600/80 hover:bg-red-700 font-medium">
              ${session.active ? '❌ End' : '✅ Reopen'}
            </button>
          </div>
          <a href="participant.html?session=${session.session_code}" target="_blank" class="block text-center mt-4 text-[var(--accent)] hover:underline">
            View Form →
          </a>
        </div>
      `).join('');
    };

    window.downloadVCF = async (sessionId) => {
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('session_id', sessionId);

      if (error || !contacts || contacts.length === 0) {
        alert('No contacts yet or error fetching!');
        return;
      }

      let vcf = '';
      contacts.forEach(c => {
        vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:\( {c.name}\nTEL: \){c.phone}\nEND:VCARD\n`;
      });

      const blob = new Blob([vcf], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shadow-vcf-${sessionId.slice(0,8)}.vcf`;
      a.click();
      URL.revokeObjectURL(url);
    };

    window.toggleSession = async (sessionId, makeActive) => {
      await supabase
        .from('sessions')
        .update({ active: makeActive })
        .eq('id', sessionId);

      await renderSessions();
    };

    await renderSessions();
  }

  if (isParticipantPage) {
    const form = document.getElementById('contactForm');
    const messageDiv = document.getElementById('message');
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('session');

    if (!sessionCode) {
      messageDiv.innerHTML = '<span class="text-red-400">Invalid link — ask owner for correct session link.</span>';
      form.style.display = 'none';
      return;
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, active')
      .eq('session_code', sessionCode)
      .single();

    if (!session || !session.active) {
      messageDiv.innerHTML = '<span class="text-red-400">This session is closed or invalid.</span>';
      form.style.display = 'none';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const phone = document.getElementById('phone').value.trim();

      const { error } = await supabase
        .from('contacts')
        .insert({ session_id: session.id, name, phone });

      if (error) {
        messageDiv.innerHTML = '<span class="text-red-400">Error: ' + error.message + '</span>';
        return;
      }

      messageDiv.innerHTML = '<span style="color:var(--accent)">✅ Added successfully! Thank you!</span>';
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      form.reset();

      setTimeout(() => messageDiv.innerHTML = '', 5000);
    });
  }
});
