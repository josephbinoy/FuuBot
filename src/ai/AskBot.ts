import { LobbyPlugin } from '../plugins/LobbyPlugin';
import { Lobby } from '../Lobby';
import { Player } from '../Player';

import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { VectorStoreRetriever } from "@langchain/core/vectorstores";
// import { formatDocumentsAsString } from "langchain/util/document";
// import { RunnablePassthrough } from "@langchain/core/runnables";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { RunnableSequence} from "@langchain/core/runnables";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import 'dotenv/config';


// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// import { PDFLoader } from "langchain/document_loaders/fs/pdf";

//multiple reference pdfs
// const directoryLoader = new DirectoryLoader(
//   "./pdfs",
//   {
//     ".pdf": (path) => new PDFLoader(path),
//   }
// );

// const documents = await directoryLoader.load();

// const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
// const splits = await textSplitter.splitDocuments(documents);

// const vectorStore = await HNSWLib.fromDocuments(splits, new OpenAIEmbeddings());
// vectorStore.save('./vectorstore_js');


export class AskBot extends LobbyPlugin {
  qnachain!: RunnableSequence;
  retriever!: VectorStoreRetriever<HNSWLib>;
  timeInvoked: number = 0;
  constructor(lobby: Lobby) {
    super(lobby, 'AskBot', 'askbot');
    this.registerEvents();
  }

  private registerEvents(){
    this.lobby.ReceivedChatCommand.on(a => this.onChatCommand(a.player, a.command, a.param));
  }

  static async create(lobby: Lobby): Promise<AskBot> {
    const instance = new AskBot(lobby);
    await instance.initializeModel();
    return instance;
  }

  private onChatCommand(player: Player, command: string, param: string): void {
    if (command === '!ask') {
      this.onAskCommand(param).then(response => {
        this.lobby.SendMessage(response);
      }).catch(err => {
        this.lobby.SendMessage(err.message);
      });
    }
  }

  private async initializeModel(): Promise<void>{
    const vectorStore = await HNSWLib.load('./src/ai/vectorstore_js', new OpenAIEmbeddings());
    const retriever = vectorStore.asRetriever(4);
    
    const template = `Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say that you don't know politely, don't try to make up an answer.
    Use three sentences maximum and keep the answer as concise as possible.
    Context:{context}
    
    Question:{question}`
    
    const customPrompt = PromptTemplate.fromTemplate(template)
    
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    //old method when only have question and context
    // const chain = RunnableSequence.from([
    //   {
    //     context: retriever.pipe(formatDocumentsAsString),
    //     question: new RunnablePassthrough(),
    //   },
    //   prompt,
    //   llm,
    //   new StringOutputParser()
    // ]);

    const ragChain = await createStuffDocumentsChain({
      llm: llm,
      prompt: customPrompt,
      outputParser: new StringOutputParser(),
    })

    this.qnachain = ragChain;
    this.retriever = retriever;
    this.logger.info('Model initialized');
  }

  private async onAskCommand(question: string): Promise<string> {
    const now = Date.now();
    if (now - this.timeInvoked < 5000) {
      throw new Error('Please wait 5 seconds before asking another question');
    }
    this.timeInvoked = now;
    if (question.length == 0) {
      throw new Error('Please ask a question! Usage: !ask <question>');
    }
    const context = await this.retriever.getRelevantDocuments(question);
    const response = await this.qnachain.invoke({
      question: question,
      context: context
    })
    
    return response;
  }
}
