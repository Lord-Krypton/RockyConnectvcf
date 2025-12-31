// Supabase client
const supabaseUrl = 'https://jtbztvfzzqdvruxbpzpa.supabase.co';
const supabaseKey = 'sb_publishable_DqBuo34Vc90IVaxcpdza_A_qzkNX4hw';
const supabase = Supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', async () => {
  const isOwnerPage = document.getElementById('createSessionBtn');
  const isParticipantPage = document.getElementById('contactForm');
  const isManagePage = document.getElementById('saveChanges');

  if (isOwnerPage) {
    const createBtn = document.getElementById('createSessionBtn');
    const modal = document.getElementById('createModal');
    const closeBtn = document.getElementById('closeModal');
    const form = document.getElementById('createForm');
    const sessionsList = document.getElementById('sessionsList');
    const noSessions = document.getElementById('noSessions');

    createBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('sessionName').value.trim();
      const groupLink = document.getElementById('groupLink').value.trim();
      const duration = parseInt(document.getElementById('duration').value);
      const expected = parseInt(document.getElementById('expected').value);
      const sessionCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const endTime = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('sessions')
        .insert({ session_code: sessionCode, name, group_link: groupLink, expected_participants: expected, end_time: endTime })
        .select()
        .single();

      if (error) return alert('Error: ' + error.message);

      modal.classList.add('hidden');
      form.reset();
      await renderSessions();

      const link = `\( {window.location.origin}/participant.html?session= \){sessionCode}`;
      navigator.clipboard.writeText(link);
      alert(`Session "\( {name}" created!\nShare link: \){link}\n(Copied)`);
    });

    const renderSessions = async () => {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !sessions.length) {
        noSessions.classList.remove('hidden');
        sessionsList.innerHTML = '';
        return;
      }

      noSessions.classList.add('hidden');

      const sessionIds = sessions.map(s => s.id);
      const { data: contacts } = await supabase.from('contacts').select('session_id').in('session_id', sessionIds);

      const countMap = {};
      contacts.forEach(c => countMap[c.session_id] = (countMap[c.session_id] || 0) + 1);

      sessionsList.innerHTML = sessions.map(s => {
        const current = countMap[s.id] || 0;
        const progress = s.expected_participants > 0 ? (current / s.expected_participants * 100) : 0;
        return `
          <div class="p-6 rounded-2xl card-glass border-glow shadow-glow">
            <h3 class="text-xl font-bold text-[var(--primary)] mb-2">\( {s.name || 'Unnamed'} ( \){s.session_code})</h3>
            <p class="text-sm text-slate-400 mb-1">Group: <a href="\( {s.group_link}" target="_blank" class="text-accent hover:underline"> \){s.group_link}</a></p>
            <p class="text-sm text-slate-400 mb-1">Ends: ${new Date(s.end_time).toLocaleString()}</p>
            <p class="text-sm text-slate-400 mb-4">Expected: ${s.expected_participants}</p>
            <div class="progress-bg h-2 mb-2 rounded-full">
              <div class="progress-bar w-[\( {progress}%]" style="width: \){progress}%"></div>
            </div>
            <p class="text-lg mb-4">\( {current} / \){s.expected_participants} participants</p>
            <div class="flex gap-3">
              <button onclick="downloadVCF('${s.id}')" class="flex-1 py-3 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] font-medium">
                📥 VCF
              </button>
              <button onclick="toggleSession('\( {s.id}', \){!s.active})" class="px-4 py-3 rounded-lg bg-red-600/80 hover:bg-red-700 font-medium">
                ${s.active ? '❌ End' : '✅ Reopen'}
              </button>
              <a href="manage.html?session=${s.session_code}" class="px-4 py-3 rounded-lg bg-primary/80 hover:bg-primary-hover font-medium">
                ✏️ Manage
              </a>
            </div>
            <a href="participant.html?session=${s.session_code}" target="_blank" class="block text-center mt-2 text-accent hover:underline">View Form</a>
          </div>
        `;
      }).join('');
    };

    window.downloadVCF = async (id) => {
      const { data: contacts, error } = await supabase.from('contacts').select('name, phone').eq('session_id', id);
      if (error || !contacts.length) return alert('No contacts!');
      let vcf = contacts.map(c => `BEGIN:VCARD\nVERSION:3.0\nFN:\( {c.name}\nTEL: \){c.phone}\nEND:VCARD\n`).join('');
      const blob = new Blob([vcf], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rockyconnect.vcf`;
      a.click();
      URL.revokeObjectURL(url);
    };

    window.toggleSession = async (id, active) => {
      await supabase.from('sessions').update({ active }).eq('id', id);
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
      messageDiv.innerHTML = '<span class="text-red-400">Invalid link.</span>';
      form.style.display = 'none';
      return;
    }

    const { data: session } = await supabase.from('sessions').select('*').eq('session_code', sessionCode).single();

    if (!session || !session.active || new Date(session.end_time) < new Date()) {
      messageDiv.innerHTML = '<span class="text-red-400">Session closed or expired.</span>';
      form.style.display = 'none';
      return;
    }

    // Check if full
    const { count } = await supabase.from('contacts').select('id', { count: 'exact' }).eq('session_id', session.id);
    if (session.expected_participants > 0 && count >= session.expected_participants) {
      messageDiv.innerHTML = '<span class="text-red-400">Session full.</span>';
      form.style.display = 'none';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const phone = document.getElementById('phone').value.trim();

      const { error } = await supabase.from('contacts').insert({ session_id: session.id, name, phone });

      if (error) return messageDiv.innerHTML = '<span class="text-red-400">Error: ' + error.message + '</span>';

      messageDiv.innerHTML = '<span style="color:var(--accent)">✅ Added!</span>';
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      form.reset();
      setTimeout(() => messageDiv.innerHTML = '', 5000);

      // Auto-end if full
      if (session.expected_participants > 0 && count + 1 >= session.expected_participants) {
        await supabase.from('sessions').update({ active: false }).eq('id', session.id);
      }
    });
  }

  if (isManagePage) {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('session');
    const contactsList = document.getElementById('contactsList');
    const sessionTitle = document.getElementById('sessionTitle');
    const saveBtn = document.getElementById('saveChanges');

    if (!sessionCode) return alert('No session specified.');

    const { data: session } = await supabase.from('sessions').select('id, name').eq('session_code', sessionCode).single();
    if (!session) return alert('Invalid session.');

    sessionTitle.textContent = `Session: ${session.name || session.session_code}`;

    const { data: contacts } = await supabase.from('contacts').select('*').eq('session_id', session.id);

    contactsList.innerHTML = contacts.map(c => `
      <div class="p-4 rounded-xl card-glass border-glow flex items-center gap-4" data-id="${c.id}">
        <input type="text" value="${c.name}" class="flex-1 px-4 py-2 bg-transparent border-b border-purple-400/50 focus:border-accent outline-none" />
        <input type="tel" value="\( {c.phone}" class="flex-1 px-4 py-2 bg-transparent border-b border-purple-400/50 focus:border-accent outline-none \){c.phone.match(/^\+[1-9]\d{1,14}$/) ? '' : 'text-red-400'}" />
        <button onclick="deleteContact('${c.id}')" class="px-4 py-2 bg-red-600/80 rounded-lg hover:bg-red-700">Delete</button>
      </div>
    `).join('');

    window.deleteContact = async (id) => {
      await supabase.from('contacts').delete().eq('id', id);
      document.querySelector(`[data-id="${id}"]`).remove();
    };

    saveBtn.addEventListener('click', async () => {
      const cards = contactsList.querySelectorAll('div[data-id]');
      for (const card of cards) {
        const id = card.dataset.id;
        const name = card.querySelector('input[type="text"]').value.trim();
        const phone = card.querySelector('input[type="tel"]').value.trim();
        if (name && phone.match(/^\+[1-9]\d{1,14}$/)) {
          await supabase.from('contacts').update({ name, phone }).eq('id', id);
        }
      }
      alert('Changes saved!');
    });
  }
});
