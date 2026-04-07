import React, { useState, useEffect, useMemo } from 'react';
import { Package, Search, CheckCircle, XCircle, AlertCircle, RefreshCw, Wand2, Database, ChevronRight, User, LogOut, Lock, Eye, EyeOff, Save, Layers, Hash, Calendar, ArrowRight, MapPin, Cpu, Image as ImageIcon } from 'lucide-react';

// ==========================================
// ⚠️ INSTRUCTIONS DE DÉPLOIEMENT (VERCELS / STACKBLITZ)
// Décommentez les lignes ci-dessous dans votre véritable projet
// ==========================================

import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// ==========================================
// 📋 RÉFÉRENTIEL DU MAGASIN (Extrait)
// Remplacez ce texte par le contenu complet de votre fichier CSV
// ==========================================
const REFERENTIEL_CSV = `,Groupe,Famille,Type
,CONSOMMABLES,Consommables,Abrasifs
,CONSOMMABLES,Consommables,Adhesifs
,CONSOMMABLES,Consommables,Agrafes
,CONSOMMABLES,Consommables,Cable metallique
,CONSOMMABLES,Consommables,Ciments et reboucheurs
,CONSOMMABLES,Consommables,Colles
,CONSOMMABLES,Consommables,Colorants
,CONSOMMABLES,Consommables,Crayons, marqueurs et temoins
,CONSOMMABLES,Consommables,Deggripants
,CONSOMMABLES,Consommables,Drisses
,CONSOMMABLES,Consommables,Films et polyanes
,CONSOMMABLES,Consommables,Graisses et lubrifiants
,CONSOMMABLES,Consommables,Joints, isolant et etancheite
,CONSOMMABLES,Consommables,Mousses
,CONSOMMABLES,Consommables,Peintures
,CONSOMMABLES,Consommables,Enduits
,CONSOMMABLES,Consommables,Produits d'entretien
,CONSOMMABLES,Consommables,Soudure
,CONSOMMABLES,Consommables,Disques
,CONSOMMABLES,Consommables,Forets
,CONSOMMABLES,Consommables,Gourdes
,CONSOMMABLES,Consommables,Sel de déneigement
,CONSOMMABLES,Consommables,Sel de régenration
,CONSOMMABLES,Consommables,Cadenas de consignation
,PLOMBERIE,Tube à souder,tube à souder
,EQUIPEMENT MEDICAL,Chariot douche,Accessoires
,EQUIPEMENT MEDICAL,Lève malade,Accessoires
,EQUIPEMENT MEDICAL,Fauteuil roulant,Accessoires
,EQUIPEMENT MEDICAL,Table d'examen,Accessoires
,EQUIPEMENT MEDICAL,Berceaux,Accessoires
,EQUIPEMENT MEDICAL,Brancard,Accessoires
,EQUIPEMENT MEDICAL,eclairage opératoire,Accessoires
,EQUIPEMENT HOTELIER,chariot et borne repas,Accessoires
,EQUIPEMENT HOTELIER,table de nuit,Accessoires
,EQUIPEMENT HOTELIER,Lave vaisselle,Accessoires
,EQUIPEMENT HOTELIER,Lave bassin,Accessoires
,EQUIPEMENT HOTELIER,Fontane à eau,Accessoires
,EQUIPEMENT HOTELIER,Machine à glaçon,Accessoires
,EQUIPEMENT HOTELIER,Machine à café,Accessoires
,AGENCEMENT,MACONNERIE,ragréage
,AGENCEMENT,MACONNERIE,carrelage
,AGENCEMENT,MACONNERIE,platre
,AGENCEMENT,MACONNERIE,Carreaux de platre
,AGENCEMENT,MACONNERIE,plaque platre
,AGENCEMENT,MACONNERIE,rails plaque de platre
,AGENCEMENT,ameublement,tablettes bois
,AGENCEMENT,menuiserie,plaque bois et pvc
,SIGNALETIQUE,Signalétique,film et bache
,SIGNALETIQUE,Signalétique,tonner
,EQUIPEMENT DE PROTECTION,EPC,Barrière
,EQUIPEMENT DE PROTECTION,EPC,Plots`;

// Composant pour écraser les marges par défaut de Vite/StackBlitz
const GlobalCssReset = () => (
  <style dangerouslySetInnerHTML={{__html: `
    #root { max-width: none !important; padding: 0 !important; margin: 0 !important; width: 100vw; height: 100vh; text-align: left !important; }
    body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background-color: #f8fafc; }
  `}} />
);

export default function BackOfficeApp() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [pendingArticles, setPendingArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [stats, setStats] = useState({ totalProcessed: 0 });
  
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');

  const [formData, setFormData] = useState({
    designation: '', marque: '', reference_fabricant: '', groupe: '', famille: '', type: ''
  });

  // --- PARSEUR DU RÉFÉRENTIEL CSV ---
  const referentiel = useMemo(() => {
    const lines = REFERENTIEL_CSV.split('\n').filter(l => l.trim().length > 0);
    const hierarchy = {};
    
    // On ignore la première ligne (les en-têtes)
    for (let i = 1; i < lines.length; i++) {
      // Sépare par virgule et retire les cellules vides (gère la virgule initiale de ton CSV)
      const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, '')).filter(c => c !== '');
      
      if (cols.length >= 3) {
        // Prendre les 3 dernières colonnes non-vides
        const type = cols.pop();
        const famille = cols.pop();
        const groupe = cols.pop();

        if (groupe && famille && type) {
          if (!hierarchy[groupe]) hierarchy[groupe] = {};
          if (!hierarchy[groupe][famille]) hierarchy[groupe][famille] = [];
          if (!hierarchy[groupe][famille].includes(type)) {
            hierarchy[groupe][famille].push(type);
          }
        }
      }
    }
    return hierarchy;
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return; }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchPendingArticles();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchPendingArticles();
      else setPendingArticles([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true); setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) { setAuthError("Identifiants incorrects."); } finally { setAuthLoading(false); }
  };

  const handleLogout = async () => { if (supabase) await supabase.auth.signOut(); };

  const fetchPendingArticles = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('articles_a_creer').select('*').eq('statut', 'en_attente').order('created_at', { ascending: true });
      if (error) throw error;
      setPendingArticles(data || []);
    } catch (e) { showToast("Erreur base de données."); } finally { setIsLoading(false); }
  };

  const handleSelectArticle = (article) => {
    setSelectedArticle(article);
    setFormData({ designation: '', marque: '', reference_fabricant: '', groupe: '', famille: '', type: '' });
  };

  // --- 🤖 IA GEMINI (Bridée avec le référentiel) ---
  const runAIAnalysis = async () => {
    if (!selectedArticle) return;
    setIsProcessingAI(true);
    
    try {
      if (!GEMINI_API_KEY) throw new Error("Clé API manquante. Ajoutez VITE_GEMINI_API_KEY sur Vercel.");

      const imageResponse = await fetch(selectedArticle.photo_url);
      const imageBlob = await imageResponse.blob();
      const base64Image = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(imageBlob);
      });

      // LE NOUVEAU PROMPT : On force l'IA à utiliser le CSV
      const promptText = `Tu es un expert magasinier technique de l'APHP.
      Analyse l'image fournie et le code-barre scanné suivant : ${selectedArticle.code_barre}.
      Identifie cet article et déduis un maximum d'informations visibles.
      
      🚨 RÈGLE ABSOLUE POUR LA CLASSIFICATION 🚨
      Tu dois OBLIGATOIREMENT choisir la combinaison "groupe", "famille" et "type" la plus pertinente PARMI CETTE LISTE EXACTE :
      ${REFERENTIEL_CSV}
      
      Ne les invente pas. Recopie la majuscule et l'orthographe exactes de la liste.
      Si rien ne correspond, laisse des chaînes vides "".

      IMPORTANT: Renvoyer UNIQUEMENT un objet JSON valide, sans formatage markdown (pas de \`\`\`json).
      Structure exacte :
      {
        "designation": "Nom complet détaillé",
        "marque": "Nom du fabricant ou 'Inconnue'",
        "reference_fabricant": "Référence lue sur la photo ou 'N/A'",
        "groupe": "Choix depuis la liste",
        "famille": "Choix depuis la liste",
        "type": "Choix depuis la liste"
      }`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }, { inlineData: { mimeType: imageBlob.type || "image/jpeg", data: base64Image } }] }],
              generationConfig: { responseMimeType: "application/json" }
          })
      });

      if (!response.ok) throw new Error("Erreur de connexion à Gemini");
      const result = await response.json();
      const cleanJsonText = result.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
      const aiData = JSON.parse(cleanJsonText);

      // Validation de la réponse IA contre le référentiel pour la sécurité
      let finalGroupe = referentiel[aiData.groupe] ? aiData.groupe : '';
      let finalFamille = (finalGroupe && referentiel[finalGroupe][aiData.famille]) ? aiData.famille : '';
      let finalType = (finalFamille && referentiel[finalGroupe][finalFamille].includes(aiData.type)) ? aiData.type : '';

      setFormData({
        designation: aiData.designation || '', 
        marque: aiData.marque || '', 
        reference_fabricant: aiData.reference_fabricant || '',
        groupe: finalGroupe, 
        famille: finalFamille, 
        type: finalType
      });

      showToast(`Analyse réussie avec ${selectedModel} !`);
    } catch(e) {
      showToast(e.message || "Erreur de l'analyse IA.");
    } finally {
      setIsProcessingAI(false);
    }
  };

  // --- VALIDATION FINALE ---
  const handleSaveToCatalog = async () => {
    if (!supabase || !selectedArticle) return;
    if (!formData.designation || !formData.marque) { showToast("Désignation et marque requises."); return; }
    if (!formData.groupe || !formData.famille || !formData.type) { showToast("Veuillez sélectionner un Groupe, une Famille et un Type."); return; }

    try {
      const newArticle = {
        code_barre: selectedArticle.code_barre, 
        designation: formData.designation, 
        marque: formData.marque,
        reference_fabricant: formData.reference_fabricant, 
        groupe: formData.groupe, 
        famille: formData.famille, 
        type: formData.type,
        photo: selectedArticle.photo_url,
        statut: 'Actif', 
        site_rattachement: selectedArticle.magasin || 'Non défini'
      };

      const { error: insertError } = await supabase.from('articles').insert([newArticle]);
      if (insertError) throw new Error(`Insertion: ${insertError.message}`);

      const { error: deleteError } = await supabase.from('articles_a_creer').delete().eq('id', selectedArticle.id);
      if (deleteError) throw new Error(`Suppression: ${deleteError.message}`);

      await supabase.from('historique_scans').update({ details: newArticle, trouve: true }).eq('code_barre', selectedArticle.code_barre);

      setStats(prev => ({ ...prev, totalProcessed: prev.totalProcessed + 1 }));
      showToast(`L'article a été ajouté au catalogue !`);
      setSelectedArticle(null);
      fetchPendingArticles();
    } catch (e) { 
      console.error(e);
      showToast(`Erreur: ${e.message}`); 
    }
  };

  const handleRejectArticle = async () => {
    if (!supabase || !selectedArticle) return;
    if (!window.confirm("Voulez-vous rejeter cette demande ?")) return;

    try {
      const { error } = await supabase.from('articles_a_creer').delete().eq('id', selectedArticle.id);
      if (error) throw new Error(error.message);

      await supabase.from('historique_scans').update({ 
            details: { designation: 'Article rejeté', marque: 'Annulé', statut: 'Rejeté' }
      }).eq('code_barre', selectedArticle.code_barre);

      showToast("Demande supprimée.");
      setSelectedArticle(null);
      fetchPendingArticles();
    } catch(e) { showToast(`Erreur: ${e.message}`); }
  };

  // --- VUES ---

  if (!supabase) {
    return (
      <>
        <GlobalCssReset />
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-slate-800 p-8">
          <div className="bg-white p-10 rounded-2xl max-w-lg w-full text-center border border-slate-200 shadow-2xl">
            <Database size={72} className="mx-auto text-emerald-500 mb-6" />
            <h1 className="text-3xl font-black mb-4">Base de données requise</h1>
            <p className="text-slate-500 text-lg mb-6">L'environnement de prévisualisation ne peut pas se connecter à votre base de données.</p>
            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-left text-sm">
                <strong>Pour utiliser ce code sur Vercel ou StackBlitz :</strong>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Décommentez les imports <code>@supabase/supabase-js</code> en haut du fichier.</li>
                    <li>Décommentez les déclarations contenant <code>import.meta.env</code>.</li>
                    <li>Supprimez les constantes "mock" ajoutées pour la prévisualisation.</li>
                </ul>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <GlobalCssReset />
        <div className="flex h-screen w-full items-center justify-center bg-slate-900 p-6">
          <div className="bg-slate-800 p-8 md:p-10 rounded-[2.5rem] max-w-md w-full shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95">
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Database size={40} className="text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-white text-center mb-2">Back-Office</h1>
            <p className="text-slate-400 text-center mb-8">Connectez-vous pour gérer le catalogue</p>
            
            {authError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-2xl mb-6 text-sm text-center">{authError}</div>}
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-slate-300 text-sm font-bold mb-2 block">Identifiant (Email)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500"><User size={20} /></div>
                  <input type="email" required className="w-full bg-slate-900 border border-slate-700 text-white rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-emerald-500" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-slate-300 text-sm font-bold mb-2 block">Mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500"><Lock size={20} /></div>
                  <input type={showPassword ? "text" : "password"} required className="w-full bg-slate-900 border border-slate-700 text-white rounded-2xl py-4 pl-12 pr-12 focus:outline-none focus:border-emerald-500" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500"><Eye size={20} /></button>
                </div>
              </div>
              <button type="submit" disabled={authLoading} className="w-full py-4 mt-4 bg-emerald-600 rounded-2xl text-white font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 transition-all">{authLoading ? 'Connexion...' : 'Se connecter'}</button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // Listes dynamiques pour les dropdowns basées sur le référentiel
  const availableGroups = Object.keys(referentiel).sort();
  const availableFamilies = formData.groupe ? Object.keys(referentiel[formData.groupe] || {}).sort() : [];
  const availableTypes = (formData.groupe && formData.famille) ? (referentiel[formData.groupe][formData.famille] || []).sort() : [];

  return (
    <>
      <GlobalCssReset />
      <div className="flex flex-col h-screen w-full bg-slate-100 font-sans text-slate-800 overflow-hidden">
        {toastMessage && (
          <div className="absolute top-20 right-8 bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl z-50 font-bold text-sm flex items-center gap-3 animate-in slide-in-from-right">
             <CheckCircle size={20} className="text-emerald-400"/> {toastMessage}
          </div>
        )}

        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm w-full">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm"><Database size={20} className="text-white" /></div>
            <div>
              <h1 className="text-lg font-black text-slate-800 leading-tight">TechScan</h1>
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">Back-Office Référencement</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
              <CheckCircle size={16} className="text-emerald-500" /><span>{stats.totalProcessed} traités session</span>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="flex items-center gap-3">
               <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold"><User size={18}/></div>
               <button onClick={handleLogout} className="text-sm font-bold text-slate-500 hover:text-red-600 flex items-center gap-2">Déconnexion <LogOut size={16}/></button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden w-full">
          <aside className="w-80 lg:w-[350px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 h-full">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
               <div>
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Package size={20} className="text-emerald-600" /> File d'attente</h2>
                 <p className="text-xs text-slate-500 font-medium mt-1">{pendingArticles.length} article(s) inconnu(s)</p>
               </div>
               <button onClick={fetchPendingArticles} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-emerald-600"><RefreshCw size={18} className={isLoading ? "animate-spin" : ""} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400"><RefreshCw size={24} className="animate-spin mb-3" /><p>Chargement...</p></div>
              ) : pendingArticles.length === 0 ? (
                <div className="text-center py-16 text-slate-400"><CheckCircle size={56} className="mx-auto mb-4 text-emerald-200" /><p className="font-bold text-lg text-slate-600">Aucun article</p></div>
              ) : (
                pendingArticles.map(article => (
                  <div key={article.id} onClick={() => handleSelectArticle(article)} className={`p-3.5 rounded-xl border flex gap-4 cursor-pointer transition-all ${selectedArticle?.id === article.id ? 'bg-emerald-50 border-emerald-400 shadow-md ring-1 ring-emerald-500/20' : 'bg-white hover:border-slate-300'}`}>
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden shrink-0 border border-slate-100 shadow-sm p-1"><img src={article.photo_url} alt="Scan" className="w-full h-full object-cover rounded" /></div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1"><MapPin size={10} /> {article.magasin}</p>
                      <p className="font-mono font-bold text-slate-800 truncate text-sm">{article.code_barre}</p>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-medium"><Calendar size={10} /> {new Date(article.created_at).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'})}</p>
                    </div>
                    <ChevronRight size={20} className={`self-center ${selectedArticle?.id === article.id ? 'text-emerald-600' : 'text-slate-300'}`} />
                  </div>
                ))
              )}
            </div>
          </aside>

          <main className="flex-1 relative overflow-y-auto p-6 lg:p-8 w-full h-full">
             {!selectedArticle ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                   <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-6"><Wand2 size={48} className="text-slate-300" /></div>
                   <h2 className="text-2xl font-extrabold text-slate-600 mb-2">Espace de Référencement</h2>
                   <p className="text-lg text-slate-500">Sélectionnez un article pour l'analyser.</p>
                </div>
             ) : (
                <div className="w-full h-full flex flex-col xl:flex-row gap-6 xl:gap-8 animate-in fade-in zoom-in-95 duration-300">
                   
                   {/* COLONNE GAUCHE : IMAGE & IA */}
                   <div className="w-full xl:w-5/12 flex flex-col gap-4 h-full">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[55%] relative">
                         <div className="flex justify-between items-center mb-4 shrink-0">
                           <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <ImageIcon size={16}/> Image scannée
                           </h3>
                           <span className="text-slate-700 font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 flex items-center gap-2"><Hash size={14} className="text-slate-400"/> {selectedArticle.code_barre}</span>
                         </div>

                         <div className="bg-slate-900 rounded-xl overflow-hidden flex-1 flex items-center justify-center relative shadow-inner w-full min-h-0">
                            <img src={selectedArticle.photo_url} className="max-w-full max-h-full object-contain" />
                         </div>
                      </div>

                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 shadow-inner flex flex-col items-center justify-center h-[45%]">
                         <div className="flex flex-col w-full max-w-sm mx-auto h-full justify-between py-2">
                             <div className="text-center">
                                 <Wand2 size={28} className="text-indigo-500 mb-2 mx-auto" />
                                 <h4 className="font-bold text-indigo-900 mb-1">Assistant IA TechScan</h4>
                                 <p className="text-xs text-indigo-700/80 mb-4">Pré-remplissage automatique des fiches.</p>
                             </div>
                             
                             <div className="w-full mb-4">
                                 <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Cpu size={12}/> Modèle IA (Moteur)</label>
                                 <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full p-2.5 text-sm font-medium rounded-xl border border-indigo-200 bg-white focus:ring-2 focus:ring-indigo-400 shadow-sm cursor-pointer" disabled={isProcessingAI}>
                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Rapide)</option>
                                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Puissant)</option>
                                 </select>
                             </div>
                             
                             <button onClick={runAIAnalysis} disabled={isProcessingAI} className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50">
                                {isProcessingAI ? <><RefreshCw size={20} className="animate-spin" /> Analyse...</> : <><Wand2 size={20} /> Analyser</>}
                             </button>
                         </div>
                      </div>
                   </div>

                   {/* COLONNE DROITE : FORMULAIRE */}
                   <div className="w-full xl:w-7/12 flex flex-col h-full">
                      <div className="bg-white p-6 lg:p-8 rounded-2xl shadow-lg border border-slate-200 flex-1 flex flex-col h-full overflow-y-auto">
                         <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-5 shrink-0">
                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><Database size={20} /></div>
                            <div><h3 className="text-2xl font-black text-slate-800">Fiche Catalogue</h3><p className="text-sm text-slate-500 font-medium">Vérifiez et complétez.</p></div>
                         </div>
                         
                         <div className="space-y-6 flex-1">
                            <div className="space-y-5">
                              <div>
                                 <label className="text-slate-700 text-xs font-extrabold mb-2 flex items-center gap-1 uppercase tracking-wider">Désignation complète <span className="text-red-500">*</span></label>
                                 <input type="text" value={formData.designation} onChange={(e) => setFormData({...formData, designation: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold text-lg rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20" placeholder="Ex: Perceuse..." />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                 <div>
                                    <label className="text-slate-700 text-xs font-extrabold mb-2 block uppercase tracking-wider">Marque <span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.marque} onChange={(e) => setFormData({...formData, marque: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-semibold rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                                 </div>
                                 <div>
                                    <label className="text-slate-700 text-xs font-extrabold mb-2 block uppercase tracking-wider">Réf. Fabricant</label>
                                    <input type="text" value={formData.reference_fabricant} onChange={(e) => setFormData({...formData, reference_fabricant: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono text-sm rounded-xl py-3 px-4 focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                                 </div>
                              </div>
                            </div>

                            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent my-2"></div>

                            {/* SECTION SÉLECTEURS DE RÉFÉRENTIEL */}
                            <div>
                              <h4 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2 uppercase tracking-widest"><Layers size={16}/> Classification (Référentiel)</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                 
                                 {/* SÉLECTEUR GROUPE */}
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Groupe <span className="text-red-500">*</span></label>
                                    <select 
                                      value={formData.groupe} 
                                      onChange={(e) => setFormData({...formData, groupe: e.target.value, famille: '', type: ''})} 
                                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                                    >
                                      <option value="">Sélectionner...</option>
                                      {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                 </div>

                                 {/* SÉLECTEUR FAMILLE (Dépendant du groupe) */}
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Famille <span className="text-red-500">*</span></label>
                                    <select 
                                      value={formData.famille} 
                                      onChange={(e) => setFormData({...formData, famille: e.target.value, type: ''})} 
                                      disabled={!formData.groupe}
                                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="">Sélectionner...</option>
                                      {availableFamilies.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                 </div>

                                 {/* SÉLECTEUR TYPE (Dépendant de la famille) */}
                                 <div>
                                    <label className="text-slate-600 text-xs font-bold mb-1.5 block">Type <span className="text-red-500">*</span></label>
                                    <select 
                                      value={formData.type} 
                                      onChange={(e) => setFormData({...formData, type: e.target.value})} 
                                      disabled={!formData.famille}
                                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-medium rounded-lg py-2.5 px-3 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="">Sélectionner...</option>
                                      {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                 </div>

                              </div>
                            </div>
                         </div>

                         <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-4 shrink-0">
                            <button onClick={handleRejectArticle} className="px-6 py-4 rounded-xl border-2 border-red-100 text-red-600 font-bold hover:bg-red-50 flex items-center justify-center gap-2">
                               <XCircle size={22} /> Rejeter
                            </button>
                            <button onClick={handleSaveToCatalog} className="flex-1 py-4 rounded-xl bg-emerald-600 text-white font-extrabold text-lg shadow-lg flex items-center justify-center gap-3 hover:bg-emerald-500 active:scale-[0.98]">
                               Approuver et Ajouter <ArrowRight size={22} />
                            </button>
                         </div>

                      </div>
                   </div>

                </div>
             )}
          </main>

        </div>
      </div>
    </>
  );
}
